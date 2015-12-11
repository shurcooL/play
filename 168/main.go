// Learn about getting httputil.ReverseProxy to play nice with SSE.
package main

import (
	"flag"
	"log"
	"net/http"
	"net/http/httputil"
	"time"
)

var (
	httpFlag = flag.String("http", ":8080", "Listen for HTTP connections on this address.")
)

func main() {
	flag.Parse()

	err := http.ListenAndServe(*httpFlag, newRouter())
	if err != nil {
		log.Fatalln(err)
	}
}

func newRouter() http.Handler {
	director := func(req *http.Request) {
		req.URL.Scheme = "http"
		req.URL.Host = "127.0.0.1:8081"

		//req.Host = "" // TODO: Figure out if this is needed; document it if so.
	}
	return &httputil.ReverseProxy{
		Director:      director,
		FlushInterval: 1 * time.Second,
	}
}
