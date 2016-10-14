// Play with serving golang.org/x/tools/present slides over HTTP.
package main

import (
	"fmt"
	"go/build"
	"html/template"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"golang.org/x/tools/present"
)

func write(w io.Writer) error {
	f, err := os.Open("talk-local-iframe/talk.slide")
	if err != nil {
		return err
	}
	defer f.Close()
	pctx := present.Context{
		ReadFile: func(filename string) ([]byte, error) {
			return ioutil.ReadFile(filename)
		},
	}
	doc, err := pctx.Parse(f, "name", 0)
	if err != nil {
		return err
	}

	dir, err := importPathToDir("golang.org/x/tools/cmd/present/templates")
	if err != nil {
		return err
	}
	tmpl := present.Template()
	tmpl = tmpl.Funcs(template.FuncMap{"playable": func(present.Code) bool { return false }})
	tmpl, err = tmpl.ParseFiles(filepath.Join(dir, "action.tmpl"), filepath.Join(dir, "slides.tmpl"))
	if err != nil {
		return err
	}

	doc.Render(w, tmpl)

	return nil
}

func run1() error {
	return write(os.Stdout)
}

func run2() error {
	http.HandleFunc("/index.html", func(w http.ResponseWriter, req *http.Request) {
		err := write(w)
		if err != nil {
			log.Println(err)
		}
	})

	{
		dir, err := importPathToDir("golang.org/x/tools/cmd/present/static")
		if err != nil {
			log.Fatalln(err)
		}
		http.Handle("/static/", http.StripPrefix("/static", http.FileServer(http.Dir(dir))))
	}

	http.Handle("/", http.FileServer(http.Dir("talk-local-iframe")))

	fmt.Println("Starting.")
	return http.ListenAndServe(":8080", nil)
}

func main() {
	err := run2()
	if err != nil {
		log.Fatalln(err)
	}
}

func importPathToDir(importPath string) (string, error) {
	p, err := build.Import(importPath, "", build.FindOnly)
	if err != nil {
		return "", err
	}
	return p.Dir, nil
}
