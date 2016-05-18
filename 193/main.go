// Play with and learn about heap profiles, memory usage stats.
package main

import (
	"crypto/rand"
	"fmt"
	"io"
	"log"
	"net/http"
	_ "net/http/pprof"
	"os"
)

var stuff [][]byte

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, req *http.Request) {
		w.Header().Set("Content-Type", "plain/text")
		fmt.Fprintf(io.MultiWriter(os.Stdout, w), "len(stuff) = %v\n", len(stuff))
		fmt.Fprintf(io.MultiWriter(os.Stdout, w), "using mem = %v MB\n", len(stuff)*10)
	})
	http.HandleFunc("/use10mb", func(w http.ResponseWriter, req *http.Request) {
		// Allocate 10 MB.
		w.Header().Set("Content-Type", "plain/text")
		fmt.Fprintln(io.MultiWriter(os.Stdout, w), "allocating 10 MB")

		tenMB := make([]byte, 10*1024*1024)

		// Fill with random bytes so it doesn't compress well.
		_, err := rand.Read(tenMB)
		if err != nil {
			panic(err)
		}

		stuff = append(stuff, tenMB)
	})

	log.Println(http.ListenAndServe("localhost:6060", nil))
}
