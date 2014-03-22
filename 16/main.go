// eX0 client test.
package main

import (
	"bytes"
	"encoding/binary"
	"io"
	"net"

	. "gist.github.com/5286084.git"

	"github.com/shurcooL/go-goon"
)

func main() {
	//conn, err := net.Dial("tcp", "localhost:25035")
	conn, err := net.Dial("tcp", "shurserv.no-ip.org:25035")
	CheckError(err)
	defer conn.Close()
	//goon.Dump(fmt.Fprint(conn, uint16(18+8), uint8(1), "somerandompass01", "1.23"))
	binary.Write(conn, binary.BigEndian, uint16(18+8))
	binary.Write(conn, binary.BigEndian, uint8(1))
	binary.Write(conn, binary.BigEndian, uint16(1))
	binary.Write(conn, binary.BigEndian, []byte("somerandompass01"))
	binary.Write(conn, binary.BigEndian, float64(123.45))
	var b bytes.Buffer
	goon.Dump(io.Copy(&b, conn))
	goon.Dump(b.Bytes())
}
