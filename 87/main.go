package main

import (
	"bufio"
	"bytes"
	"io"
	"log"
	"net/http"
	"os"

	"github.com/shurcooL/go-goon"
)

func main() {
	originalRequest, err := http.NewRequest("GET", "https://example.org/index.html", nil)
	if err != nil {
		panic(err)
	}

	goon.Dump(originalRequest)

	req := new(http.Request)
	switch 1 {
	case 0:
		var buf bytes.Buffer
		originalRequest.Write(&buf)

		println(buf.String())

		req, err = http.ReadRequest(bufio.NewReader(&buf))
		if err != nil {
			panic(err)
		}
	case 1:
		*req = *originalRequest // includes shallow copies of maps, but okay
	}

	goon.Dump(req)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Fatal("resp error:", err)
	}
	defer resp.Body.Close()

	goon.Dump(req)

	io.Copy(os.Stdout, resp.Body)
}
