package main

import (
	"fmt"
	"io"
	"io/ioutil"
	"net/http"
)

func main() {
	req, err := http.NewRequest("GET", "https://storage.googleapis.com/golang/go1.3.2.darwin-amd64-osx10.8.pkg", nil)
	if err != nil {
		panic(err)
	}
	//req.Header.Add("Content-Length", "45")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()
	//body, err := ioutil.ReadAll(resp.Body)
	body, err := ioutil.ReadAll(io.LimitReader(resp.Body, 50))

	fmt.Println(len(body))
}
