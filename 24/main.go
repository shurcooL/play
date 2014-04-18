// Sample values of Go types.
package main

import (
	"net/http"
	"reflect"

	"github.com/shurcooL/go-goon"
)

func main() {
	db := make(map[reflect.Type]interface{})

	httpRequestType := reflect.TypeOf(http.Request{})

	if _, ok := db[httpRequestType].([]http.Request); !ok {
		db[httpRequestType] = []http.Request(nil)
	}

	db[httpRequestType] = append(db[httpRequestType].([]http.Request), http.Request{Method: "sample"})
	db[httpRequestType] = append(db[httpRequestType].([]http.Request), http.Request{Method: "sample2"})

	for _, v := range db[httpRequestType].([]http.Request) {
		goon.Dump(v)
	}
}
