package main

import (
	"bytes"
	"html/template"
	"log"
	"strings"
	"time"
)

func main() {
	t := template.New("")
	src := ""
	for i := 0; i < 10000; i++ {
		src += "Hello, {{.}}!"
	}
	log.Println("len(src):", len(src))

	start := time.Now()
	_, err := t.Parse(src)
	if err != nil {
		panic(err)
	}
	log.Println("Parsing time:", time.Since(start))

	var buf bytes.Buffer
	start = time.Now()
	err = t.Execute(&buf, "Mr. Smith")
	if err != nil {
		panic(err)
	}
	log.Println("Execution time :", time.Since(start))

	if got, want := buf.String(), strings.Repeat("Hello, Mr. Smith!", 10000); got != want {
		panic("got != want")
	}
}
