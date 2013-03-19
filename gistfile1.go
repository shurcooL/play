package main

import (
	"code.google.com/p/go.net/websocket"
	"fmt"
	"io"
	"net/http"
	"os"
	"github.com/davecgh/go-spew/spew"
)

var _ = spew.Dump
var _ = fmt.Print

func main() {
	println("starting")
	http.Handle("/", websocket.Handler(handler))
	http.HandleFunc("/list", list)
	err := http.ListenAndServe("localhost:4000", nil)
	if err != nil {
		panic("ListenAndServe: " + err.Error())
	}
}

type socket struct {
	io.Writer
	conn *websocket.Conn
}

var statuses = map[*websocket.Conn]string{}

func (s socket) Write(b []byte) (int, error) {
	statuses[s.conn] = string(b)
	os.Stdout.Write(b)
	return s.Writer.Write(b)
}

func handler(c *websocket.Conn) {
	println("New handler #", len(statuses) + 1)
	io.Copy(socket{c, c}, c)
	println(".. done")
	delete(statuses, c)
}

func list(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "We have %v connections.", len(statuses))
	for _, v := range statuses {
		fmt.Fprintf(w, "\n\t%q", v)
	}
}