package main

import (
	"fmt"
	"io/ioutil"
	"net/http"
	"strings"
	//. "github.com/shurcooL/go/gists/gist4668739"
)

// GoKeywords returns a list of Go keywords.
func GoKeywords() []string {
	//var go_spec = "/usr/local/go/doc/go_spec.html"
	//go_spec string
	//b, err := ioutil.ReadFile(go_spec)
	/*b, err := exec.Command("curl", "-s", "http://golang.org/ref/spec").Output()
	if err != nil {
		panic(err)
	}
	s := string(b)*/
	s := HttpGet("http://golang.org/ref/spec")
	//fmt.Println(s)
	f := strings.Index(s, "following keywords are reserved and may not be used as identifiers")
	s = s[f:]
	//fmt.Printf("%v", s)
	start := "<pre class=\"grammar\">"
	f = strings.Index(s, start)
	s = s[f+len(start)+0:]
	//fmt.Printf("%v", s)
	e := strings.Index(s, "</pre>")
	s = s[:e]
	//fmt.Printf(">%v<\n---\n", s)
	o := strings.Fields(s)
	//fmt.Printf("%v\n", o)
	//fmt.Printf("%v", strings.Join(o, ", "))
	return o
}

func main() {
	fmt.Println(GoKeywords())
}

// Vendor gist4668739 package so this can compile after that package is removed.

func HttpGet(url string) string {
	return string(HttpGetB(url))
}
func HttpGetB(url string) []byte {
	r, err := http.Get(url)
	if err != nil {
		panic(err)
	}
	defer r.Body.Close()
	b, err := ioutil.ReadAll(r.Body)
	if err != nil {
		panic(err)
	}
	return b
}
