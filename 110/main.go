// Try net/rpc (using encoding/gob) between backend and frontend (via GopherJS) through a websocket connection.
package main

import (
	"fmt"
	"io"
	"net/http"
	"net/rpc"

	"github.com/shurcooL/go/gopherjs_http"
	"golang.org/x/net/websocket"
)

type Args struct {
	A, B int
}

type Arith struct{}

func (_ *Arith) Multiply(args *Args, reply *int) error {
	*reply = args.A * args.B
	fmt.Printf("locally multiplying %v by %v -> %v\n", args.A, args.B, *reply)
	return nil
}

func main() {
	rpc.Register(&Arith{})
	http.Handle("/rpc-websocket", websocket.Handler(func(conn *websocket.Conn) {
		// Why is this exported field undocumented?
		//
		// It seems it needs to be set to websocket.BinaryFrame so that
		// the Write method sends bytes as binary rather than text frames.
		conn.PayloadType = websocket.BinaryFrame

		rpc.ServeConn(conn)
	}))

	http.HandleFunc("/index.html", func(w http.ResponseWriter, req *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		io.WriteString(w, `<html>
	<head></head>
	<body>
		<pre id="output"></pre>
		<script type="text/javascript" src="/script.js"></script>
	</body>
</html>
`)
	})
	http.Handle("/script.js", gopherjs_http.GoFiles("./script.go"))

	err := http.ListenAndServe(":8080", nil)
	if err != nil {
		panic(err)
	}
}

// ---

type dumpReadWriteCloser struct {
	io.ReadWriteCloser
}

func (d dumpReadWriteCloser) Read(p []byte) (n int, err error) {
	n, err = d.ReadWriteCloser.Read(p)
	fmt.Println("Read:", n, err, p[:n])
	fmt.Printf("%#q\n", string(p[:n]))
	return
}
func (d dumpReadWriteCloser) Write(p []byte) (n int, err error) {
	n, err = d.ReadWriteCloser.Write(p)
	fmt.Println("Write:", n, err, p[:n])
	fmt.Printf("%#q\n", string(p[:n]))
	return
}
func (d dumpReadWriteCloser) Close() error {
	err := d.ReadWriteCloser.Close()
	fmt.Println("Close:", err)
	return err
}
