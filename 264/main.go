// Play with creating a new HTML component while rendering
// the page with WebAssembly (which has convenient reload).
package main

import (
	"io/ioutil"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/shurcooL/go/osutil"
	"github.com/shurcooL/gofontwoff"
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
	fontsHandler := httpgzip.FileServer(gofontwoff.Assets, httpgzip.FileServerOptions{ServeError: httpgzip.Detailed})
	err := http.ListenAndServe("localhost:8080", errorHandler{handler{fontsHandler: fontsHandler}.ServeHTTP})
	return err
}

type handler struct {
	fontsHandler http.Handler
}

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
	case req.URL.Path == "/-/style.css":
		w.Header().Set("Content-Type", "text/css; charset=utf-8")
		return serveFile(w, req, filepath.Join("_data", "style.css"))
	case req.URL.Path == "/-/fonts" || strings.HasPrefix(req.URL.Path, "/-/fonts/"):
		req = stripPrefix(req, len("/-/fonts"))
		h.fontsHandler.ServeHTTP(w, req)
		return nil
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

// stripPrefix returns request r with prefix of length prefixLen stripped from r.URL.Path.
// prefixLen must not be longer than len(r.URL.Path), otherwise stripPrefix panics.
// If r.URL.Path is empty after the prefix is stripped, the path is changed to "/".
func stripPrefix(r *http.Request, prefixLen int) *http.Request {
	r2 := new(http.Request)
	*r2 = *r
	r2.URL = new(url.URL)
	*r2.URL = *r.URL
	r2.URL.Path = r.URL.Path[prefixLen:]
	if r2.URL.Path == "" {
		r2.URL.Path = "/"
	}
	return r2
}
