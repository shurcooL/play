// Play with compiling existing Go packages using GopherJS and serving archive objects over http with CORS.
package main

import (
	"fmt"
	"net/http"

	gbuild "github.com/gopherjs/gopherjs/build"
	"github.com/gopherjs/gopherjs/compiler"
)

const prefix = "/pkg/"

func main() {
	http.HandleFunc(prefix, handler)
	panic(http.ListenAndServe("localhost:8081", nil))
}

func handler(w http.ResponseWriter, req *http.Request) {
	pkgPath := req.URL.Path[len(prefix) : len(req.URL.Path)-len(".a.js")]

	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/octet-stream")

	err := func() error {
		options := &gbuild.Options{CreateMapFile: false, Verbose: true}
		s := gbuild.NewSession(options)

		if _, err := s.ImportPackage(pkgPath); err != nil {
			return err
		}
		pkg := s.Packages[pkgPath]
		if err := compiler.WriteArchive(pkg.Archive, w); err != nil {
			return err
		}
		return nil
	}()
	fmt.Println(err)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
	}
}
