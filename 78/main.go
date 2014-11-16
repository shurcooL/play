package main

import (
	"bytes"
	"compress/gzip"
	"encoding/gob"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"sort"

	"github.com/dustin/go-humanize"
	"github.com/shurcooL/go/u/u5"
	"github.com/smartystreets/mafsa"
)

func main() {
	const path = "/Users/Dmitri/Dropbox/Work/2013/GoLand/src/github.com/shurcooL/Conception-go/data/all-Go-packages.json"

	f, err := os.Open(path)
	if err != nil {
		panic(err)
	}
	defer f.Close()

	var importers u5.Importers
	if err := json.NewDecoder(f).Decode(&importers); err != nil {
		panic(err)
	}

	var ss = make([]string, len(importers.Results))
	for i, entry := range importers.Results {
		ss[i] = entry.Path
	}

	sort.Strings(ss)

	bt := mafsa.New()
	for _, s := range ss {
		bt.Insert(s)
	}
	bt.Finish()

	fmt.Println(bt.Contains("github.com/shurcooL/go/vcs"))

	/*err = bt.Save("/Users/Dmitri/Dropbox/Work/2013/GoLand/src/github.com/shurcooL/Conception-go/data/all-Go-packages")
	if err != nil {
		panic(err)
	}*/

	encodeUsingMafsa := func(w io.Writer) error {
		fmt.Println("using mafsa")
		data, err := new(mafsa.Encoder).Encode(bt)
		if err != nil {
			return err
		}
		_, err = w.Write(data)
		return err
	}
	encodeUsingGob := func(w io.Writer) error {
		fmt.Println("using encoding/gob")
		return gob.NewEncoder(w).Encode(ss)
	}

	printUncompressedAndCompressedSizes := func(encoder func(w io.Writer) error) {
		var buf1 bytes.Buffer

		err := encoder(&buf1)
		if err != nil {
			panic(err)
		}

		fmt.Println("uncompressed:", humanize.Bytes(uint64(buf1.Len())))

		var buf2 bytes.Buffer
		gw := gzip.NewWriter(&buf2)
		_, err = io.Copy(gw, &buf1)
		if err != nil {
			panic(err)
		}
		err = gw.Close()
		if err != nil {
			panic(err)
		}
		fmt.Println("gzip:", humanize.Bytes(uint64(buf2.Len())))
		fmt.Println()
	}

	printUncompressedAndCompressedSizes(encodeUsingMafsa)
	printUncompressedAndCompressedSizes(encodeUsingGob)
}
