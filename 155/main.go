// Learn about Server-Sent Events.
package main

import (
	"flag"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/shurcooL/httpfs/html/vfstemplate"
	"github.com/shurcooL/httpgzip"
)

var httpFlag = flag.String("http", ":8080", "Listen for HTTP connections on this address.")

var t *template.Template

func loadTemplates() error {
	var err error
	t = template.New("").Funcs(template.FuncMap{})
	t, err = vfstemplate.ParseGlob(assets, t, "/assets/*.tmpl")
	return err
}

func mainHandler(w http.ResponseWriter, req *http.Request) {
	if err := loadTemplates(); err != nil {
		log.Println("loadTemplates:", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	err := t.ExecuteTemplate(w, "index.html.tmpl", nil)
	if err != nil {
		log.Println("t.Execute:", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
}

func eventsHandler(w http.ResponseWriter, req *http.Request) {
	log.Println("Client connection joined:", &w)
	defer log.Println("Client connection gone away:", &w)

	flusher, ok := w.(http.Flusher)
	if !ok {
		log.Println("Streaming unsupported")
		http.Error(w, "Streaming unsupported.", http.StatusInternalServerError)
		return
	}

	closeNotifier, ok := w.(http.CloseNotifier)
	if !ok {
		log.Println("CloseNotifier unsupported")
		http.Error(w, "CloseNotifier unsupported.", http.StatusInternalServerError)
		return
	}
	closeChan := closeNotifier.CloseNotify()

	w.Header().Set("Content-Type", "text/event-stream")
	/*w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")*/

	for {
		_, err := fmt.Fprintf(w, "data: %s\n\n", time.Now().String())
		if err != nil {
			log.Println("(via write error:", err)
			return
		}

		flusher.Flush()

		select {
		case <-closeChan:
			log.Println("(via CloseNotifier)")
			return
		case <-time.After(3 * time.Second):
		}
	}
}

func main() {
	flag.Parse()

	err := loadTemplates()
	if err != nil {
		log.Fatalln("loadTemplates:", err)
	}

	http.Handle("/favicon.ico", http.NotFoundHandler())
	http.HandleFunc("/", mainHandler)
	http.HandleFunc("/events", eventsHandler)
	http.Handle("/assets/", httpgzip.FileServer(assets, httpgzip.FileServerOptions{ServeError: httpgzip.Detailed}))

	printServingAt(*httpFlag)
	err = http.ListenAndServe(*httpFlag, nil)
	if err != nil {
		log.Fatalln("ListenAndServe:", err)
	}
}

func printServingAt(addr string) {
	hostPort := addr
	if strings.HasPrefix(hostPort, ":") {
		hostPort = "localhost" + hostPort
	}
	fmt.Printf("serving at http://%s/\n", hostPort)
}
