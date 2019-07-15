// Play with serving an augmented Go module proxy server
// that adds the module std, containing the Go standard library.
package main

import (
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/shurcooL/play/256/moduleproxy"
	"github.com/shurcooL/play/256/moduleproxy/std"
)

func main() {
	err := run()
	if err != nil {
		log.Fatalln(err)
	}
}

func run() error {
	log.Println("serving at http://localhost:8080")

	v, ok := os.LookupEnv("PLAY266_GOPROXY")
	if !ok {
		return fmt.Errorf("a Go module proxy must be provided via PLAY266_GOPROXY env var")
	}
	proxyURL, err := url.Parse(v)
	if err != nil {
		return err
	}
	if proxyURL.Scheme == "file" {
		http.DefaultTransport.(*http.Transport).RegisterProtocol("file", http.NewFileTransport(http.Dir(proxyURL.Path)))
		proxyURL.Path = "/"
	}
	mp, err := std.NewServer(moduleproxy.Server{URL: *proxyURL})
	if err != nil {
		return err
	}

	err = http.ListenAndServe("localhost:8080", errorHandler{handler{mp: mp}.ServeHTTP})
	return err
}

type handler struct {
	mp std.Server
}

func (h handler) ServeHTTP(w http.ResponseWriter, req *http.Request) error {
	switch {
	case req.URL.Path == "/-/api/proxy" || strings.HasPrefix(req.URL.Path, "/-/api/proxy/"):
		req = stripPrefix(req, len("/-/api/proxy"))
		err := h.mp.ServeHTTP(w, req)
		return err
	default:
		http.Error(w, "404 Not Found", http.StatusNotFound)
		return nil
	}
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
