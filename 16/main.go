// eX0 client test.
package main

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"net"
	"time"

	"github.com/shurcooL/go-goon"
)

const MAX_UDP_PACKET_SIZE = 1448

type PacketType uint8

const (
	JoinServerRequestPacketType        PacketType = 1
	JoinServerAcceptPacketType         PacketType = 2
	UdpConnectionEstablishedPacketType PacketType = 5
	EnterGamePermissionPacketType      PacketType = 6
	EnteredGameNotificationPacketType  PacketType = 7
	LoadLevelPacketType                PacketType = 20
	CurrentPlayersInfoPacketType       PacketType = 21
	LocalPlayerInfoPacketType          PacketType = 30

	HandshakePacketType PacketType = 100
	PingPacketType      PacketType = 10
	PongPacketType      PacketType = 11
	PungPacketType      PacketType = 12
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

type UdpConnectionEstablishedPacket struct {
	TcpPacketHeader
}

type LoadLevelPacket struct {
	TcpPacketHeader

	LevelFilename []byte
}

type CurrentPlayersInfoPacket struct {
	TcpPacketHeader

	Players []PlayerInfo
}

type PlayerInfo struct {
	NameLength uint8
	Name       []byte
	Team       uint8
	State      *State // If Team != 2.
}

type State struct {
	LastCommandSequenceNumber uint8
	X                         float32
	Y                         float32
	Z                         float32
}

type EnterGamePermissionPacket struct {
	TcpPacketHeader
}

type EnteredGameNotificationPacket struct {
	TcpPacketHeader
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

type PingPacket struct {
	UdpPacketHeader

	PingData    [4]byte
	LastLatency []uint16
}

type PongPacket struct {
	UdpPacketHeader

	PingData [4]byte
}

type PungPacket struct {
	UdpPacketHeader

	PingData [4]byte
}

var state struct {
	TotalPlayerCount uint8
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

		state.TotalPlayerCount = r.TotalPlayerCount + 1
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

	{
		var r UdpConnectionEstablishedPacket
		err := binary.Read(tcp, binary.BigEndian, &r)
		if err != nil {
			panic(err)
		}
		goon.Dump(r)
	}

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

	{
		var r LoadLevelPacket
		err := binary.Read(tcp, binary.BigEndian, &r.TcpPacketHeader)
		if err != nil {
			panic(err)
		}
		r.LevelFilename = make([]byte, r.PacketLength)
		err = binary.Read(tcp, binary.BigEndian, &r.LevelFilename)
		if err != nil {
			panic(err)
		}
		goon.Dump(r)
		goon.Dump(string(r.LevelFilename))
	}

	{
		var r CurrentPlayersInfoPacket
		err := binary.Read(tcp, binary.BigEndian, &r.TcpPacketHeader)
		if err != nil {
			panic(err)
		}
		r.Players = make([]PlayerInfo, state.TotalPlayerCount)
		for i := range r.Players {
			var playerInfo PlayerInfo
			err = binary.Read(tcp, binary.BigEndian, &playerInfo.NameLength)
			if err != nil {
				panic(err)
			}

			if playerInfo.NameLength != 0 {
				playerInfo.Name = make([]byte, playerInfo.NameLength)
				err = binary.Read(tcp, binary.BigEndian, &playerInfo.Name)
				if err != nil {
					panic(err)
				}

				err = binary.Read(tcp, binary.BigEndian, &playerInfo.Team)
				if err != nil {
					panic(err)
				}

				if playerInfo.Team != 2 {
					playerInfo.State = new(State)
					err = binary.Read(tcp, binary.BigEndian, playerInfo.State)
					if err != nil {
						panic(err)
					}
				}
			}

			r.Players[i] = playerInfo
		}
		goon.Dump(r)
	}

	{
		var r EnterGamePermissionPacket
		err := binary.Read(tcp, binary.BigEndian, &r)
		if err != nil {
			panic(err)
		}
		goon.Dump(r)
	}

	{
		var p EnteredGameNotificationPacket
		p.PacketType = EnteredGameNotificationPacketType

		p.PacketLength = 0

		err := binary.Write(tcp, binary.BigEndian, &p)
		if err != nil {
			panic(err)
		}
	}

	fmt.Println("done")

	for {
		var b [MAX_UDP_PACKET_SIZE]byte
		n, err := udp.Read(b[:])
		if err != nil {
			panic(err)
		}
		var buf = bytes.NewReader(b[:n])

		var r PingPacket
		err = binary.Read(buf, binary.BigEndian, &r.UdpPacketHeader)
		if err != nil {
			panic(err)
		}
		if r.PacketType != PingPacketType {
			continue
		}
		err = binary.Read(buf, binary.BigEndian, &r.PingData)
		if err != nil {
			panic(err)
		}
		r.LastLatency = make([]uint16, state.TotalPlayerCount)
		err = binary.Read(buf, binary.BigEndian, &r.LastLatency)
		if err != nil {
			panic(err)
		}
		//goon.Dump(r)

		//time.Sleep(123 * time.Millisecond)

		{
			var p PongPacket
			p.PacketType = PongPacketType
			p.PingData = r.PingData

			err := binary.Write(udp, binary.BigEndian, &p)
			if err != nil {
				panic(err)
			}
		}
	}

	select {}
}
