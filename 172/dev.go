// +build dev

package main

import (
	"net/http"

	"github.com/shurcooL/httpfs/union"
)

var assets = union.New(map[string]http.FileSystem{
	"/assets": http.Dir("."),
})
