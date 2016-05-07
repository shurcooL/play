package main

import (
	"fmt"
	"io"
	"io/ioutil"
	"net/http"
	"os"

	"github.com/shurcooL/go-goon"
	fetchhttp "github.com/shurcooL/play/192/go-js-fetch/http"
)

func run() error {
	c := http.Client{Transport: &fetchhttp.FetchTransport{}}
	resp, err := c.Get("https://localhost:4430/reqinfo")
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	goon.Dump(resp)
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	_, err = os.Stdout.Write(body)
	return err
}

func stream() error {
	c := http.Client{Transport: &fetchhttp.FetchTransport{}}
	resp, err := c.Get("https://localhost:4430/clockstream")
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	goon.Dump(resp)
	_, err = io.Copy(os.Stdout, resp.Body)
	return err
}

func main() {
	if err := run(); err != nil {
		fmt.Println(err)
	}
	if err := stream(); err != nil {
		fmt.Println(err)
	}
}
