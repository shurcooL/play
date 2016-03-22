// WebSocket server test.
package main

import (
	"bufio"
	"fmt"
	"html"
	"io"
	"net/http"
	"sort"
	"sync"
	"time"

	"github.com/shurcooL/go/gopherjs_http"
	"golang.org/x/net/websocket"
)

type ConnectionTime struct {
	c *websocket.Conn
	t time.Time
}

var state = struct {
	Statuses map[ConnectionTime]string

	sync.RWMutex
}{Statuses: make(map[ConnectionTime]string)}

func CapLength(str string, max_len int) string {
	if len(str) > max_len {
		str = str[:max_len]
	}
	return str
}

func handler(c *websocket.Conn) {
	ct := ConnectionTime{c, time.Now()}
	state.Lock()
	state.Statuses[ct] = "" // Default blank status
	println("New handler #", len(state.Statuses))
	update()
	state.Unlock()

	defer func() {
		state.Lock()
		println("End of handler #", len(state.Statuses))
		delete(state.Statuses, ct)
		update()
		state.Unlock()
	}()

	ch := lineReader(c)
	for {
		select {
		case b, ok := <-ch:
			if !ok {
				return
			}
			if len(string(b)) > 160 {
				return
			}

			state.Lock()
			state.Statuses[ct] = string(b)
			update()
			state.Unlock()
		}
	}
}

// A data structure to hold a key/value pair.
type Pair struct {
	Key   ConnectionTime
	Value string
}

// A slice of Pairs that implements sort.Interface to sort by Value.
type Pairs []Pair

func (p Pairs) Swap(i, j int)      { p[i], p[j] = p[j], p[i] }
func (p Pairs) Len() int           { return len(p) }
func (p Pairs) Less(i, j int) bool { return p[i].Key.t.UnixNano() < p[j].Key.t.UnixNano() }

// A function to turn a map into a Pairs, then sort and return it.
func SortMapByKey(m map[ConnectionTime]string) Pairs {
	p := make(Pairs, len(m))
	i := 0
	for k, v := range m {
		p[i] = Pair{k, v}
		i++
	}
	sort.Sort(p)
	return p
}

func update() {
	full_update := ""
	sorted_c := SortMapByKey(state.Statuses)
	for _, p := range sorted_c {
		full_update += fmt.Sprintf("<span>Someone: %s</span><br>", html.EscapeString(p.Value))
	}

	for ct := range state.Statuses {
		ct.c.Write([]byte(full_update))
	}
}

func list(w http.ResponseWriter, r *http.Request) {
	state.RLock()
	defer state.RUnlock()

	fmt.Fprintf(w, "We have %v connection(s).\n", len(state.Statuses))
	fmt.Fprintf(w, "%#v", state.Statuses)
}

func main() {
	println("Starting.")

	http.Handle("/status", websocket.Handler(handler))
	http.HandleFunc("/list", list)
	//http.Handle("/", gopherjs_http.StaticHtmlFile("./live-status-go.html"))
	http.Handle("/", gopherjs_http.HtmlFile("./live-status-go.html"))
	http.Handle("/conn-api.html", gopherjs_http.HtmlFile("./live-status-go-conn-api.html"))
	http.HandleFunc("/live-status-js.html", func(w http.ResponseWriter, r *http.Request) { http.ServeFile(w, r, "./live-status-js.html") })
	http.Handle("/favicon.ico/", http.NotFoundHandler())
	err := http.ListenAndServe(":34600", nil)
	if err != nil {
		panic(err)
	}
}

func lineReader(r io.Reader) <-chan []byte {
	ch := make(chan []byte)
	go func() {
		br := bufio.NewReader(r)
		for {
			line, err := br.ReadBytes('\n')
			if err != nil {
				ch <- line
				close(ch)
				return
			}
			ch <- line[:len(line)-1] // Trim last newline.
		}
	}()
	return ch
}
