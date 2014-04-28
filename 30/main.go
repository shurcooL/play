// Simple web server, for testing live Go editing.
package main

import (
	"fmt"
	"net/http"
)

func handler(w http.ResponseWriter, req *http.Request) {
	fmt.Fprintf(w, "Hey there, this is %q!", req.URL.Path)
	fmt.Println(req.URL.Path)
}

func main() {
	fmt.Println("Starting.")

	http.HandleFunc("/", handler)
	err := http.ListenAndServe(":8080", nil)
	if err != nil {
		panic(err)
	}
}
