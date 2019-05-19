// Play with a simple local module host.
package main

import (
	"archive/zip"
	"fmt"
	"io"
	"log"
	"net/http"
	"path"
)

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, req *http.Request) {
		switch path.Clean(req.URL.Path) {
		case "/test/mod", "/test/mod/pkg":
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			io.WriteString(w, `<meta name="go-import" content="localhost.localhost/test/mod mod https:">`)
		case "/test/mod/@v/list":
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			io.WriteString(w, "v0.0.0\n")
		case "/test/mod/@v/v0.0.0.info":
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			io.WriteString(w, "{\n\t\"Version\": \"v0.0.0\",\n\t\"Time\": \"2019-05-04T15:44:36Z\"\n}\n")
		case "/test/mod/@v/v0.0.0.mod":
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			io.WriteString(w, "module localhost.localhost/test/mod\n")
		case "/test/mod/@v/v0.0.0.zip":
			w.Header().Set("Content-Type", "application/zip")
			z := zip.NewWriter(w)
			defer z.Close()
			for _, file := range []struct {
				Name, Body string
			}{
				{"localhost.localhost/test/mod@v0.0.0/go.mod", "module localhost.localhost/test/mod\n"},
				{"localhost.localhost/test/mod@v0.0.0/pkg.go", "package pkg\n\n// Life is the answer.\nconst Life = 42\n"},
				{"localhost.localhost/test/mod@v0.0.0/pkg/pkg.go", "package pkg\n\n// Life is the answer.\nconst Life = 43\n"},
			} {
				f, err := z.Create(file.Name)
				if err != nil {
					panic(err)
				}
				_, err = f.Write([]byte(file.Body))
				if err != nil {
					panic(err)
				}
			}
		default:
			http.Error(w, "404 Not Found", http.StatusNotFound)
		}
	})

	fmt.Println("starting HTTPS server")
	err := http.ListenAndServeTLS("127.0.0.1:https", "localhost.localhost.pem", "localhost.localhost-key.pem", top{})
	log.Fatalln(err)
}

type top struct{}

func (top) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	fmt.Println(req.Method, req.URL)
	http.DefaultServeMux.ServeHTTP(w, req)
}
