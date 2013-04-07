package main

import (
	"code.google.com/p/go.net/websocket"
	"fmt"
	"io"
	"net/http"
	//"os"
	"github.com/davecgh/go-spew/spew"
	. "gist.github.com/5286084.git"
)

var _ = spew.Dump
var _ = fmt.Print

func main() {
	println("starting")
	http.Handle("/status", websocket.Handler(handler))
	http.HandleFunc("/list", list)
	err := http.ListenAndServe(":8080", nil)
	CheckError(err)
}

var statuses = map[*websocket.Conn]string{}

func TrimLastNewline(str string) string {
	if '\n' == str[len(str)-1] {
		return str[0 : len(str)-1]
	}
	return str
}

func handler(c *websocket.Conn) {
	// TODO: Should use a mutex here or something
	statuses[c] = ""		// Default blank status
	println("New handler #", len(statuses))
	update()

	defer update()
	defer delete(statuses, c)
	defer println("End of handler #", len(statuses))

	ch, errCh := byteReader(c)
	for {
		select {
		case b := <-ch:
			statuses[c] = TrimLastNewline(string(b))
			//c.Write(b)
			//os.Stdout.Write(b)
			update()
			fmt.Printf("%#v\n", statuses)
		case <-errCh:
			return
		}
	}
}

func update() {
	for c := range statuses {
		c.Write([]byte(fmt.Sprintf("%#v", statuses)))
	}	
}

func list(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "We have %v connections.\n", len(statuses))
	fmt.Fprintf(w, "%#v", statuses)
}

func byteReader(r io.Reader) (<-chan []byte, <-chan error) {
	return byteReaderSize(r, 0)
}

// Credit to Tarmigan
func byteReaderSize(r io.Reader, size int) (<-chan []byte, <-chan error) {
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