// Play with using go/microformats to fetch
// a GitHub login from a website URL.
package main

import (
	"flag"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"

	"willnorris.com/go/microformats"
)

func main() {
	flag.Parse()
	if flag.NArg() != 1 {
		log.Fatalln("usage: argument 1 must be website URL")
	}
	websiteURL := flag.Arg(0)

	login, err := fetchGitHubLogin(websiteURL)
	if err != nil {
		log.Fatalln(err)
	}
	fmt.Println(login)
}

func fetchGitHubLogin(websiteURL string) (string, error) {
	u, err := url.Parse(websiteURL)
	if err != nil {
		return "", err
	}
	resp, err := http.Get(u.String())
	if err != nil {
		return "", err
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := ioutil.ReadAll(resp.Body)
		return "", fmt.Errorf("non-200 OK status code: %v body: %q", resp.Status, body)
	}
	data := microformats.Parse(resp.Body, u)
	for _, me := range data.Rels["me"] {
		if !strings.HasPrefix(me, "https://github.com/") {
			continue
		}
		login := me[len("https://github.com/"):]
		if i := strings.Index(login, "/"); i >= 0 {
			login = login[:i]
		}
		return login, nil
	}
	return "", os.ErrNotExist
}
