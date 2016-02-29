// +build ignore

package main

import (
	"bytes"
	"html/template"
	"log"
	"time"
)

func main() {
	tmpl := template.New("test")
	t := ""
	for i := 0; i < 10000; i++ {
		t += "Hello, {{.}}\n"
	}
	start := time.Now()
	tmpl.Parse(t)
	elapsed := time.Since(start)
	log.Printf("Parsing time elapsed: %s", elapsed)

	buf := bytes.NewBuffer([]byte{})
	start = time.Now()
	tmpl.Execute(buf, "Mr. Smith")
	elapsed = time.Since(start)
	log.Printf("Execution time elapsed: %s", elapsed)
}
