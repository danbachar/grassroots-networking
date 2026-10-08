#!/usr/bin/env python3
"""Mininet topology for the NAT detection testbed.

Starting artefact for the student project described in nat-project.pdf.
Builds one emulated "Internet" with several nodes, each behind a NAT whose
behaviour class is set by construction, plus un-NATed hosts for the witnesses
and a two-address oracle.

    sudo python3 mininet-topology.py

Requires Linux, root, mininet >= 2.3 and nftables. Mininet hosts are network
namespaces sharing the host filesystem, so a binary installed on the machine
runs inside them directly -- no images to build.

STATUS: UNTESTED. Written on macOS, where neither mininet nor nft can run.
The topology follows the documented mininet API; the nftables rulesets are
best-effort and MUST be validated against the RFC 5780 oracle before any
measurement is taken. Each ruleset below is annotated with how confident that
annotation is. Validating them is week 4-6 work in the brief, and the exit
criterion there ("all three mapping classes present, the address-dependent one
demonstrably so") exists precisely because this file cannot be trusted on
inspection alone.

Address plan
    198.18.0.0/15   the emulated public side (RFC 2544 benchmarking range)
    10.<n>.0.0/24   the private LAN behind NAT <n>

NOTE: isGloballyRoutableIPv4 in lib/src/transport/address_utils.dart excludes
198.18.0.0/15 along with every other range usable here. Until that predicate
takes a test seam, every node will classify itself as not well-connected and
nothing under test will fire. See the prerequisites in nat-project.pdf.
"""

from mininet.topo import Topo
from mininet.net import Mininet
from mininet.node import Node, OVSBridge
from mininet.link import TCLink
from mininet.cli import CLI
from mininet.log import setLogLevel, info

PUBLIC = '198.18'          # public side: 198.18.<router>.<host>
ORACLE_A = '198.18.0.20'   # oracle primary address
ORACLE_B = '198.18.0.21'   # oracle alternate address (RFC 5780 needs two)
ORACLE_PORTS = (3478, 3479)

# Which NAT class sits in front of each node. Add entries to grow the testbed;
# the pairwise matrix is the point, so one node per class is the minimum.
NODES = [
    ('n1', 'endpoint_independent'),
    ('n2', 'address_dependent'),
    ('n3', 'address_and_port_dependent'),
]


class LinuxRouter(Node):
    """A host that forwards. Mininet has no router primitive -- which is why it
    can be a NAT of whatever class we write onto it."""

    def config(self, **params):
        super().config(**params)
        self.cmd('sysctl -w net.ipv4.ip_forward=1')

    def terminate(self):
        self.cmd('sysctl -w net.ipv4.ip_forward=0')
        super().terminate()


class NatTopo(Topo):
    def build(self):
        core = self.addSwitch('s0')                      # the emulated Internet

        for i, (node, _cls) in enumerate(NODES, start=1):
            lan = self.addSwitch(f's{i}')
            nat = self.addHost(f'nat{i}', cls=LinuxRouter, ip=None)
            host = self.addHost(node, ip=f'10.{i}.0.2/24',
                                defaultRoute=f'via 10.{i}.0.1')
            self.addLink(host, lan)
            self.addLink(nat, lan)                       # inside  -> nat-ethX
            self.addLink(nat, core)                      # outside -> nat-ethY

        # Un-NATed hosts. Witnesses need distinct vantage points, not capacity:
        # two at distinct addresses plus one reachable on a second port is the
        # minimum that makes every class separable.
        self.addHost('w1', ip=f'{PUBLIC}.0.10/16')
        self.addHost('w2', ip=f'{PUBLIC}.0.11/16')
        self.addHost('oracle', ip=f'{ORACLE_A}/16')
        for h in ('w1', 'w2', 'oracle'):
            self.addLink(h, core)


# ---------------------------------------------------------------- NAT classes
#
# Each entry returns the nft commands for one mapping behaviour. {ext} is the
# router's outside address, {oif} its outside interface.

def _base(oif):
    return [
        'nft add table ip nat',
        'nft add chain ip nat postrouting '
        '{ type nat hook postrouting priority 100 \\; }',
        'nft add chain ip nat prerouting '
        '{ type nat hook prerouting priority -100 \\; }',
    ]


def endpoint_independent(ext, oif):
    """CONFIDENT. Plain masquerade: conntrack reuses one mapping for a given
    source tuple regardless of destination, which reads externally as
    endpoint-independent mapping."""
    return _base(oif) + [
        f'nft add rule ip nat postrouting oifname {oif} masquerade',
    ]


def address_and_port_dependent(ext, oif):
    """CONFIDENT. fully-random allocates a fresh port per flow, so each
    destination endpoint sees a different external port."""
    return _base(oif) + [
        f'nft add rule ip nat postrouting oifname {oif} masquerade fully-random',
    ]


def address_dependent(ext, oif):
    """UNVERIFIED, and the known-hard case. No netfilter knob produces
    address-dependent mapping, so it is constructed: pin one external port per
    destination address, so the mapping varies with the destination address but
    not with its port. Collisions are a non-issue only because a single node
    sits behind this NAT.

    Validate against the oracle. If it reads as endpoint-independent or
    address-and-port-dependent instead, the fallback is a userspace NAT.
    Extend the map as witnesses are added -- an unlisted destination falls
    through to plain masquerade and would be mislabelled."""
    return _base(oif) + [
        f'nft add rule ip nat postrouting oifname {oif} '
        f'ip daddr {PUBLIC}.0.10 snat to {ext}:20000',
        f'nft add rule ip nat postrouting oifname {oif} '
        f'ip daddr {PUBLIC}.0.11 snat to {ext}:21000',
        f'nft add rule ip nat postrouting oifname {oif} '
        f'ip daddr {ORACLE_A} snat to {ext}:22000',
        f'nft add rule ip nat postrouting oifname {oif} '
        f'ip daddr {ORACLE_B} snat to {ext}:23000',
        f'nft add rule ip nat postrouting oifname {oif} masquerade',
    ]


NAT_CLASSES = {
    'endpoint_independent': endpoint_independent,
    'address_dependent': address_dependent,
    'address_and_port_dependent': address_and_port_dependent,
}

# Filtering is the second axis and is NOT configured here. Linux conntrack
# admits inbound matching the full tuple, which reads as address-and-port-
# dependent filtering; EIF and ADF need explicit accept rules on the forward
# chain. Left out deliberately rather than sketched wrongly -- specify it with
# the test-to-witness-topology table, then add it here.


def main():
    setLogLevel('info')
    # OVSBridge, not the default OVSSwitch: with no controller the default runs
    # in secure fail mode and drops every packet.
    net = Mininet(topo=NatTopo(), link=TCLink, switch=OVSBridge, controller=None)
    net.start()

    for i, (node, cls) in enumerate(NODES, start=1):
        nat = net.get(f'nat{i}')
        inside, outside = f'nat{i}-eth0', f'nat{i}-eth1'
        ext = f'{PUBLIC}.{i}.1'

        nat.cmd(f'ip addr add 10.{i}.0.1/24 dev {inside}')
        nat.cmd(f'ip addr add {ext}/16 dev {outside}')
        for rule in NAT_CLASSES[cls](ext, outside):
            nat.cmd(rule)
        info(f'*** nat{i}: {cls}  ext={ext}  behind it: {node}\n')

    # The oracle needs a second address; RFC 5780 cannot be run from one.
    net.get('oracle').cmd(f'ip addr add {ORACLE_B}/16 dev oracle-eth0')
    info(f'*** oracle: {ORACLE_A} + {ORACLE_B} on ports {ORACLE_PORTS}\n')

    # Launch one node per host once a headless build exists. Mininet hosts share
    # the filesystem, so give each its own state directory or they collide.
    #
    # for node, _ in NODES:
    #     net.get(node).cmd(
    #         f'dart run bin/node.dart --config {node}.json '
    #         f'--state /var/lib/gn/{node} > /tmp/{node}.log 2>&1 &')

    CLI(net)
    net.stop()


if __name__ == '__main__':
    main()
