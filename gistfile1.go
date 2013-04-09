package main

import (
	"code.google.com/p/go.net/websocket"
	"fmt"
	"io"
	"net/http"
	//"os"
	"github.com/davecgh/go-spew/spew"
	. "gist.github.com/5286084.git"

	"sort"
	"time"
	"html"
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

type ConnectionTime struct {
	c *websocket.Conn
	t time.Time
}
var statuses = map[ConnectionTime]string{}

func TrimLastNewline(str string) string {
	if '\n' == str[len(str)-1] {
		return str[0 : len(str)-1]
	}
	return str
}

func CapLength(str string, max_len int) string {
	if len(str) > max_len {
		str = str[:max_len]
	}
	return str
}

func handler(c *websocket.Conn) {
	// TODO: Should use a mutex here or something
	ct := ConnectionTime{c, time.Now()}
	statuses[ct] = ""		// Default blank status
	println("New handler #", len(statuses))
	update()

	defer update()
	defer delete(statuses, ct)
	defer println("End of handler #", len(statuses))

	ch, errCh := byteReader(c)
	for {
		select {
		case b := <-ch:
			statuses[ct] = TrimLastNewline(string(b))
			if len(statuses[ct]) > 160 {
				return
			}
			//c.Write(b)
			//os.Stdout.Write(b)
			update()
			//fmt.Printf("%#v\n", statuses)
		case <-errCh:
			return
		}
	}
}

// A data structure to hold a key/value pair.
type Pair struct {
	Key   ConnectionTime
	Value string
}

// A slice of Pairs that implements sort.Interface to sort by Value.
type PairList []Pair

func (p PairList) Swap(i, j int)      { p[i], p[j] = p[j], p[i] }
func (p PairList) Len() int           { return len(p) }
func (p PairList) Less(i, j int) bool { return p[i].Key.t.UnixNano() < p[j].Key.t.UnixNano() }

// A function to turn a map into a PairList, then sort and return it.
func SortMapByKey(m map[ConnectionTime]string) PairList {
	p := make(PairList, len(m))
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
	sorted_c := SortMapByKey(statuses)
	for _, p := range sorted_c {
		full_update += fmt.Sprintf("<span>Someone: %s</span><br>", html.EscapeString(p.Value))
	}

	for ct := range statuses {
		ct.c.Write([]byte(full_update))
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