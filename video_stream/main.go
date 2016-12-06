// HTML Video Stream server.
//
// Based on http://phoboslab.org/log/2013/09/html5-live-video-streaming-via-websockets.
package main

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"sync"

	"golang.org/x/net/websocket"
)

// ffmpeg -s 640x480 -f video4linux2 -i /dev/video0 -f mpeg1video -b 800k -r 30 'http://127.0.0.1:8084/input?width=640&height=480'
// goexec 'http.ListenAndServe(":8080", http.FileServer(http.Dir(".")))'

var data = make(ChanWriter)

var state = struct {
	Statuses      map[*websocket.Conn]struct{}
	Width, Height int

	sync.RWMutex
}{Statuses: make(map[*websocket.Conn]struct{})}

func output(c *websocket.Conn) {
	// TODO: See if maybe this would help? It wasn't here when I wrote the code originally.
	c.PayloadType = websocket.BinaryFrame

	state.Lock()
	state.Statuses[c] = struct{}{}
	println("New handler #", len(state.Statuses))

	var streamHeader = struct {
		Magic  [4]byte
		Width  uint16
		Height uint16
	}{
		[...]byte{'j', 's', 'm', 'p'},
		uint16(state.Width),
		uint16(state.Height),
	}
	var buf bytes.Buffer
	binary.Write(&buf, binary.BigEndian, streamHeader)
	fmt.Println("Sending header of len", len(buf.Bytes()))
	err := websocket.Message.Send(c, buf.Bytes())
	if err != nil {
		panic(err)
	}

	state.Unlock()

	//time.Sleep(30 * time.Second)
	select {} // TODO: Fix leak and unreachable code below.

	defer func() {
		state.Lock()
		println("End of handler #", len(state.Statuses))
		delete(state.Statuses, c)
		state.Unlock()
	}()
}

func input(w http.ResponseWriter, r *http.Request) {
	state.Lock()
	state.Width, _ = strconv.Atoi(r.URL.Query().Get("width"))
	state.Height, _ = strconv.Atoi(r.URL.Query().Get("height"))
	state.Unlock()

	//io.Copy(os.Stdout, r.Body)
	//io.Copy(data, r.Body)

	b := make([]byte, 1024)

	for {
		n, err := r.Body.Read(b)
		// TODO: If we cared about correctness, should process b[:n] bytes before checking/dealing with error.
		if err != nil {
			return
		}

		state.Lock()
		fmt.Println("Sending data to", len(state.Statuses))
		for c := range state.Statuses {
			//n, err := c.Write(b)
			err := websocket.Message.Send(c, b)
			if err != nil {
				log.Println(err)
				delete(state.Statuses, c)
				continue
			}
			fmt.Println("Wrote", n, "bytes to some websocket")
		}
		state.Unlock()
	}

	fmt.Println("Video feed disconnected.")
}

func list(w http.ResponseWriter, r *http.Request) {
	state.RLock()
	defer state.RUnlock()

	fmt.Fprintf(w, "We have %v connection(s).\n", len(state.Statuses))
	fmt.Fprintf(w, "%#v\n%vx%v", state.Statuses, state.Width, state.Height)
}

func main() {
	println("Starting.")

	http.Handle("/output", websocket.Handler(output))
	http.HandleFunc("/input", input)
	http.HandleFunc("/list", list)
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) { http.ServeFile(w, r, "./live-status.html") })
	http.Handle("/favicon.ico/", http.NotFoundHandler())
	err := http.ListenAndServe(":8080", nil)
	if err != nil {
		panic(err)
	}
}

// ChanWriter writes bytes into a channel.
type ChanWriter chan []byte

// Write implements io.Writer.
func (cw ChanWriter) Write(p []byte) (n int, err error) {
	// Make a copy of p in order to avoid retaining it.
	b := make([]byte, len(p))
	copy(b, p)
	cw <- b
	return len(b), nil
}
