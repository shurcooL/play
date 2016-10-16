// Learn about how req.URL.Path and req.RequestURI compare after http.StripPrefix.
package main

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
)

func run() error {
	http.Handle("/", http.StripPrefix("/prefix", http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		fmt.Fprintln(io.MultiWriter(w, os.Stdout), "hello", req.URL.Path, req.RequestURI)
	})))

	fmt.Println("Starting.")
	return http.ListenAndServe(":8080", nil)
}

func main() {
	err := run()
	if err != nil {
		log.Fatalln(err)
	}
}
