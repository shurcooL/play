package main

import (
	"code.google.com/p/go.net/websocket"
	"fmt"
	"io"
	"net/http"
	"os"
)

var _ = fmt.Print

func main() {
	println("starting")
	http.Handle("/", websocket.Handler(handler))
	http.HandleFunc("/count", count)
	err := http.ListenAndServe("localhost:4000", nil)
	if err != nil {
		panic("ListenAndServe: " + err.Error())
	}
}

type socket struct {
	io.Writer
}

func (s socket) Write(b []byte) (int, error) {
	os.Stdout.Write(b)
	return s.Writer.Write(b)
}

var TotalHandlers int

func handler(c *websocket.Conn) {
	TotalHandlers++
	println("New handler #", TotalHandlers)
	io.Copy(socket{c}, c)
	println(".. done")
	TotalHandlers--
}

func count(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "We have %v connections.", TotalHandlers)
}