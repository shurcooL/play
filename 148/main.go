// Try switching tabs in frontend, without reloading tabs.
package main

import (
	"flag"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"

	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"

	"github.com/shurcooL/go/gzip_file_server"
	"github.com/shurcooL/go/vfs/httpfs/html/vfstemplate"
	"github.com/shurcooL/htmlg"
)

var httpFlag = flag.String("http", ":8080", "Listen for HTTP connections on this address.")

var t *template.Template

func loadTemplates() error {
	var err error
	t = template.New("").Funcs(template.FuncMap{})
	t, err = vfstemplate.ParseGlob(assets, t, "/assets/*.tmpl")
	return err
}

var state struct {
	mu sync.Mutex
}

func tabs(query url.Values) template.HTML {
	//return `<a class="active" onclick="Open(event, this);">Tab 1</a><a>Tab 2</a><a>Tab 3</a>`

	var selectedTab = query.Get("tab")

	var ns []*html.Node

	for _, tab := range []struct {
		id   string
		name string
	}{{"", "Tab 1"}, {"2", "Tab 2"}, {"3", "Tab 3"}} {
		a := &html.Node{Type: html.ElementNode, Data: atom.A.String()}
		if tab.id == selectedTab {
			a.Attr = []html.Attribute{{Key: "class", Val: "active"}}
		} else {
			u := url.URL{
				Path: "/",
			}
			if tab.id != "" {
				u.RawQuery = url.Values{"tab": {tab.id}}.Encode()
			}
			a.Attr = []html.Attribute{{Key: atom.Href.String(), Val: u.String()}}
		}
		a.Attr = append(a.Attr, html.Attribute{Key: "onclick", Val: "SwitchTab(event, this);"})
		a.AppendChild(htmlg.Text(tab.name))
		ns = append(ns, a)
	}

	tabs, err := htmlg.RenderNodes(ns...)
	if err != nil {
		panic(err)
	}
	return tabs
}

func mainHandler(w http.ResponseWriter, req *http.Request) {
	if err := loadTemplates(); err != nil {
		log.Println("loadTemplates:", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	state.mu.Lock()
	data := struct {
		Tabs template.HTML
	}{
		Tabs: tabs(req.URL.Query()),
	}
	err := t.ExecuteTemplate(w, "index.html.tmpl", &data)
	state.mu.Unlock()
	if err != nil {
		log.Println("t.Execute:", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
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
	http.Handle("/assets/", gzip_file_server.New(assets))

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
