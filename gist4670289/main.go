// Command gist4670289 returns a list of Go keywords (first Go code I ever wrote).
package main

import (
	"fmt"
	"io/ioutil"
	"net/http"
	"strings"
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
	s := httpGet("http://golang.org/ref/spec")
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

// ---

func httpGet(url string) string {
	b, err := httpGetB(url)
	if err != nil {
		panic(err)
	}
	return string(b)
}
func httpGetB(url string) ([]byte, error) {
	resp, err := http.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("non-200 status code: %v", resp.StatusCode)
	}
	b, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	return b, nil
}
