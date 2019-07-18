// Benchmark syscall/js performance between
// WebAssembly, GopherJS, and native JavaScript.
package main

import (
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/shurcooL/go/osutil"
	"github.com/shurcooL/httpgzip"
)

func main() {
	err := run()
	if err != nil {
		log.Fatalln(err)
	}
}

func run() error {
	log.Println("serving at http://localhost:8080")
	err := http.ListenAndServe("localhost:8080", errorHandler{handler{}.ServeHTTP})
	return err
}

type handler struct{}

func (h handler) ServeHTTP(w http.ResponseWriter, req *http.Request) error {
	switch {
	case req.URL.Path == "/-/main.wasm":
		tempDir, err := ioutil.TempDir("", "")
		if err != nil {
			return err
		}
		defer os.RemoveAll(tempDir)
		wasmFile := filepath.Join(tempDir, "main.wasm")
		cmd := exec.CommandContext(req.Context(), "go", "build", "-o", wasmFile, "./frontend")
		env := osutil.Environ(os.Environ())
		env.Set("GOOS", "js")
		env.Set("GOARCH", "wasm")
		cmd.Env = env
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		err = cmd.Run()
		if err != nil {
			return err
		}
		w.Header().Set("Content-Type", "application/wasm")
		return serveFile(w, req, wasmFile)
	case req.URL.Path == "/-/wasm_exec.js":
		w.Header().Set("Content-Type", "application/javascript")
		return serveFile(w, req, filepath.Join("_data", "wasm_exec.js"))
	case req.URL.Path == "/favicon.ico":
		http.Error(w, "404 Not Found", http.StatusNotFound)
		return nil
	default:
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		return serveFile(w, req, filepath.Join("_data", "index.html"))
	}
}

func serveFile(w http.ResponseWriter, req *http.Request, path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	fi, err := f.Stat()
	if err != nil {
		return err
	}
	httpgzip.ServeContent(w, req, fi.Name(), fi.ModTime(), f)
	return nil
}
