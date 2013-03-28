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

var statuses = map[*websocket.Conn]string{}

func TrimLastNewline(str string) string {
	if '\n' == str[len(str)-1] {
		return str[0 : len(str)-1]
	}
	return str
}

func handler(c *websocket.Conn) {
	statuses[c] = ""		// Default blank status
	defer delete(statuses, c)

	println("New handler #", len(statuses))

	ch, errCh := byteReader(c, 0)
	for {
		select {
		case b := <-ch:
			statuses[c] = TrimLastNewline(string(b))
			c.Write(b)
			os.Stdout.Write(b)
		case <-errCh:
			return
		}
	}
}

func list(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "We have %v connections.", len(statuses))
	for _, v := range statuses {
		fmt.Fprintf(w, "\n\t%q", v)
	}
}

// Credit to Tarmigan
func byteReader(r io.Reader, size int) (<-chan []byte, <-chan error) {
	if size <= 0 {
		size = 2048
	}

	ch := make(chan []byte)
	errCh := make(chan error)

	go func() {
		for {
			buf := make([]byte, size)
			s := 0
		inner:
			for {
				n, err := r.Read(buf[s:])
				if n > 0 {
					ch <- buf[s : s+n]
					s += n
				}
				if err != nil {
					errCh <- err
					return
				}
				if s >= len(buf) {
					break inner
				}
			}
		}
	}()

	return ch, errCh
} 