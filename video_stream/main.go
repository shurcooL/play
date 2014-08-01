// HTML Video Stream server.
package main

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"net/http"
	"strconv"
	"sync"
	"time"

	"code.google.com/p/go.net/websocket"

	. "github.com/shurcooL/go/gists/gist6096872"
)

// ffmpeg -s 640x480 -f video4linux2 -i /dev/video0 -f mpeg1video -b 800k -r 30 'http://10.0.0.22:8080/input?width=640&height=480'

var data = make(ChanWriter)

var state = struct {
	Statuses      map[*websocket.Conn]struct{}
	Width, Height int

	sync.RWMutex
}{Statuses: make(map[*websocket.Conn]struct{})}

func output(c *websocket.Conn) {
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

	time.Sleep(30 * time.Second)

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
		if err != nil {
			return
		}

		state.Lock()
		fmt.Println("Sending data to", len(state.Statuses))
		for c := range state.Statuses {
			//n, err := c.Write(b)
			err := websocket.Message.Send(c, b)
			if err != nil {
				panic(err)
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
	http.Handle("/favicon.ico", http.NotFoundHandler())
	err := http.ListenAndServe(":8080", nil)
	if err != nil {
		panic(err)
	}
}
