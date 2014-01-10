package main

import (
	"net/http"
	"net/http/httputil"

	. "gist.github.com/5286084.git"
)

func dumpRequestHandler(w http.ResponseWriter, r *http.Request) {
	dump, err := httputil.DumpRequest(r, true)
	CheckError(err)
	println(string(dump))
}

func main() {
	println("Starting...")

	err := http.ListenAndServe(":8080", http.HandlerFunc(dumpRequestHandler))
	CheckError(err)
}
