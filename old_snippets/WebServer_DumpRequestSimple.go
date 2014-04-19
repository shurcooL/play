package main

import (
	"fmt"
	"net/http"
	"net/http/httputil"

	. "gist.github.com/5286084.git"
)

func dumpRequestHandler(w http.ResponseWriter, r *http.Request) {
	dump, err := httputil.DumpRequest(r, true)
	CheckError(err)

	fmt.Println(string(dump))
}

func main() {
	fmt.Println("Starting http request dumper...")

	err := http.ListenAndServe(":8080", http.HandlerFunc(dumpRequestHandler))
	CheckError(err)
}
