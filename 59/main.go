package main

import (
	"net/http"

	"github.com/elazarl/go-bindata-assetfs"
	"github.com/shurcooL/go/raw_file_server"
)

func main() {
	m := map[string]string{
		"hello":      "Hi!",
		"index.html": "Hi!",
		"second":     "hour",
		"third":      "...",
	}
	_ = m

	//fs := mapfs.New(m)
	//fs := vfs.OS("./assets/")

	//httpFs := httpfs.New(fs)
	httpFs := &assetfs.AssetFS{Asset: Asset, AssetDir: AssetDir, Prefix: ""}

	panic(http.ListenAndServe(":8080", raw_file_server.NewUsingHttpFs(httpFs)))
}
