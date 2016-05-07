package http

import (
	"io/ioutil"
	"net/http"
	"os"
	"testing"
)

func Test(t *testing.T) {
	c := http.Client{Transport: &XHRTransport{}}
	resp, err := c.Get("http://example.com/")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatal("status code is not 200 OK")
	}
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	_, err = os.Stdout.Write(body)
	if err != nil {
		t.Fatal(err)
	}
}
