// eX0 client test.
package main

import (
	"encoding/binary"
	"fmt"
	"net"
	"time"

	"github.com/shurcooL/go-goon"
)

type PacketType uint8

const (
	JoinServerRequestPacketType PacketType = 1
	JoinServerAcceptPacketType  PacketType = 2
	LocalPlayerInfoPacketType   PacketType = 30

	HandshakePacketType PacketType = 100
)

//go:generate stringer -type=PacketType

type TcpPacketHeader struct {
	PacketLength uint16
	PacketType   PacketType
}

type JoinServerRequestPacket struct {
	TcpPacketHeader

	Version    uint16
	Passphrase [16]byte
	Signature  uint64
}

type JoinServerAcceptPacket struct {
	TcpPacketHeader

	YourPlayerId     uint8
	TotalPlayerCount uint8
}

type LocalPlayerInfoPacket struct {
	TcpPacketHeader

	NameLength  uint8
	Name        []byte
	CommandRate uint8
	UpdateRate  uint8
}

type UdpPacketHeader struct {
	PacketType PacketType
}

type HandshakePacket struct {
	UdpPacketHeader

	Signature uint64
}

func main() {
	tcp, err := net.Dial("tcp", "localhost:25045")
	if err != nil {
		panic(err)
	}
	defer tcp.Close()

	var signature = uint64(time.Now().UnixNano())

	{
		var p = JoinServerRequestPacket{
			TcpPacketHeader: TcpPacketHeader{
				PacketType: JoinServerRequestPacketType,
			},
			Version:    1,
			Passphrase: [16]byte{'s', 'o', 'm', 'e', 'r', 'a', 'n', 'd', 'o', 'm', 'p', 'a', 's', 's', '0', '1'},
			Signature:  signature,
		}

		p.PacketLength = 26

		err := binary.Write(tcp, binary.BigEndian, &p)
		if err != nil {
			panic(err)
		}
	}

	{
		var r JoinServerAcceptPacket
		err := binary.Read(tcp, binary.BigEndian, &r)
		if err != nil {
			panic(err)
		}
		goon.Dump(r)
	}

	udp, err := net.Dial("udp", "localhost:25045")
	if err != nil {
		panic(err)
	}
	defer udp.Close()

	{
		var p HandshakePacket
		p.PacketType = HandshakePacketType
		p.Signature = signature

		err := binary.Write(udp, binary.BigEndian, &p)
		if err != nil {
			panic(err)
		}
	}

	time.Sleep(time.Second) // HACK, TODO: Need to wait for UDP Connection Established packet.

	{
		const name = "shurcooL"

		var p LocalPlayerInfoPacket
		p.PacketType = LocalPlayerInfoPacketType
		p.NameLength = uint8(len(name))
		p.Name = []byte(name)
		p.CommandRate = 20
		p.UpdateRate = 20

		p.PacketLength = 3 + uint16(len(name))

		err := binary.Write(tcp, binary.BigEndian, &p.TcpPacketHeader)
		if err != nil {
			panic(err)
		}
		err = binary.Write(tcp, binary.BigEndian, &p.NameLength)
		if err != nil {
			panic(err)
		}
		err = binary.Write(tcp, binary.BigEndian, &p.Name)
		if err != nil {
			panic(err)
		}
		err = binary.Write(tcp, binary.BigEndian, &p.CommandRate)
		if err != nil {
			panic(err)
		}
		err = binary.Write(tcp, binary.BigEndian, &p.UpdateRate)
		if err != nil {
			panic(err)
		}
	}

	fmt.Println("done")

	time.Sleep(5 * time.Second)
}
