package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/shurcooL/httpfs/vfsutil"
)

func main() {
	ns := vfsutil.NameSpace{}
	ns.Bind("/test1", http.Dir("./"), "/", vfsutil.BindReplace)
	ns.Bind("/assets2", http.Dir("../95/"), "/", vfsutil.BindReplace)

	ns.Fprint(os.Stdout)

	walkFn := func(path string, fi os.FileInfo, err error) error {
		if err != nil {
			log.Printf("can't stat file %s: %v\n", path, err)
			return nil
		}
		fmt.Println(path)
		return nil
	}

	err := vfsutil.Walk(ns, "/test1", walkFn)
	if err != nil {
		panic(err)
	}
	err = vfsutil.Walk(ns, "/assets2", walkFn)
	if err != nil {
		panic(err)
	}
}
