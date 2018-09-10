// +build ignore

package main

import (
	"fmt"
	"log"
	"net/http"
	"time"
)

func main() {
	http.HandleFunc("/sse", func(w http.ResponseWriter, req *http.Request) {
		if req.Method != "GET" && req.Method != "HEAD" {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "405 Method Not Allowed\n\nmethod should be GET or HEAD", http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		f, ok := w.(http.Flusher)
		if !ok {
			log.Println("streaming unsupported")
			http.Error(w, "streaming unsupported", http.StatusInternalServerError)
			return
		}
		for now := range time.Tick(time.Second) {
			fmt.Fprintf(w, "data: %s\n\n", now.Format("15:04:05"))
			f.Flush()
		}
	})
	log.Fatalln(http.ListenAndServe("localhost:8090", nil))
}
