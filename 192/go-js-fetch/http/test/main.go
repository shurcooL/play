package main

import (
	"fmt"
	"hash/crc32"
	"io"
	"io/ioutil"
	"net/http"
	"os"
	"strings"

	"github.com/shurcooL/go-goon"
	fetchhttp "github.com/shurcooL/play/192/go-js-fetch/http"
)

var _ http.RoundTripper = &fetchhttp.FetchTransport{}

//var client = http.Client{Transport: &fetchhttp.FetchTransport{}}
//var client = http.Client{Transport: &http.XHRTransport{}}
var client = http.DefaultClient

func get() error {
	req, err := http.NewRequest("GET", "https://gotools.org:34602/reqinfo", nil)
	if err != nil {
		return err
	}
	req.Header.Set("test-header-cl-x", "value1, value2")
	req.Header.Set("test-header-cl-y", "value1")
	req.Header.Add("test-header-cl-y", "value2")
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	goon.Dump(resp)
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	fmt.Fprintf(os.Stdout, "begin >>")
	n, err := os.Stdout.Write(body)
	fmt.Fprintf(os.Stdout, "<< end (%d)\n", n)
	return err
}

func redirect() error {
	req, err := http.NewRequest("GET", "https://gotools.org:34602/redirect", nil)
	if err != nil {
		return err
	}
	tr := client.Transport
	if tr == nil {
		tr = http.DefaultTransport
	}
	resp, err := tr.RoundTrip(req)
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

func put() error {
	const reqBody = "Hello there. \x00\xC3\x28 How are you?"

	req, err := http.NewRequest("PUT", "https://gotools.org:34602/crc32", strings.NewReader(reqBody))
	if err != nil {
		return err
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	goon.Dump(resp)
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	n, err := os.Stdout.Write(body)
	if err != nil {
		return err
	}
	fmt.Printf("\nbody = %v bytes\n", n)

	crc := crc32.NewIEEE()
	rn, err := io.Copy(crc, strings.NewReader(reqBody))
	fmt.Printf("reqBody bytes=%d, CRC32=%x\n", rn, crc.Sum(nil))
	return err
}

/*func stream() error {
	resp, err := client.Get("https://gotools.org:34602/clockstream")
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	goon.Dump(resp)
	_, err = io.Copy(os.Stdout, resp.Body)
	return err
}*/

func stream() error {
	resp, err := client.Get("https://gotools.org:34602/clockstream")
	if err != nil {
		return err
	}
	//defer resp.Body.Close()
	goon.Dump(resp)
	_, err = io.CopyN(os.Stdout, resp.Body, 1500) // Copy (i.e., stream!) first 1500 bytes, and stop.
	fmt.Println(resp.Body.Close())
	return err
}

func main() {
	if err := get(); err != nil {
		fmt.Println(err)
	}
	if err := redirect(); err != nil {
		fmt.Println(err)
	}
	if err := put(); err != nil {
		fmt.Println(err)
	}
	//return
	if err := stream(); err != nil {
		fmt.Println(err)
	}
	fmt.Print(" ...stopping short.\nall done!\n")
}
