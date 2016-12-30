package main

import (
	"encoding/json"
	"log"
	"net/url"

	"github.com/shurcooL/go-goon"
)

func main() {
	err := run()
	if err != nil {
		log.Fatalln(err)
	}
}

func run() error {
	query := url.Values{
		"RepoURI":  {"example.org/repo"},
		"OptState": {"open"},
	}
	_ = query

	var q struct {
		RepoURI  []string
		OptState []string
	}

	err := DecodeViaJSON(query, &q)
	if err != nil {
		return err
	}

	goon.DumpExpr(q)

	return nil
}

// DecodeViaJSON takes the map data and passes it through encoding/json to convert it into the
// given Go native structure pointed to by v. v must be a pointer to a struct.
func DecodeViaJSON(data interface{}, v interface{}) error {
	// Perform the task by simply marshalling the input into JSON, then unmarshalling
	// it into target native Go struct.
	b, err := json.Marshal(data)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, v)
}
