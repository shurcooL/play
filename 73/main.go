package main

import (
	"archive/zip"
	"net/http"

	"code.google.com/p/go.tools/godoc/vfs/zipfs"

	"github.com/shurcooL/go/raw_file_server"
)

func main() {
	rc, err := zip.OpenReader("sample.zip")
	if err != nil {
		panic(err)
	}

	fs := zipfs.New(rc, "name")

	panic(http.ListenAndServe(":8080", raw_file_server.New(fs)))
}
