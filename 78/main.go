package main

import (
	"bytes"
	"compress/gzip"
	"compress/zlib"
	"encoding/gob"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"sort"

	"github.com/dgryski/go-trigram"
	"github.com/dustin/go-humanize"
	"github.com/shurcooL/go/gddo"
	"github.com/smartystreets/mafsa"
)

func main() {
	const path = "/Users/Dmitri/Dropbox/Work/2013/Data Sets/all-Go-packages.json"

	f, err := os.Open(path)
	if err != nil {
		panic(err)
	}
	defer f.Close()

	var importers gddo.Importers
	err = json.NewDecoder(f).Decode(&importers)
	if err != nil {
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
	encodeUsingJson := func(w io.Writer) error {
		fmt.Println("using encoding/json")
		return json.NewEncoder(w).Encode(ss)
	}
	encodeUsingNewlines := func(w io.Writer) error {
		fmt.Println("using newlines")
		for _, s := range ss {
			fmt.Fprintln(w, s)
		}
		return nil
	}
	encodeUsingGob := func(w io.Writer) error {
		fmt.Println("using encoding/gob")
		return gob.NewEncoder(w).Encode(ss)
	}
	encodeTrigramUsingGob := func(w io.Writer) error {
		fmt.Println("trigram using encoding/gob")
		return gob.NewEncoder(w).Encode(trigram.NewIndex(ss))
	}

	printUncompressedAndCompressedSizes := func(encoder func(w io.Writer) error) {
		var buf1 bytes.Buffer

		err := encoder(&buf1)
		if err != nil {
			panic(err)
		}

		fmt.Println("uncompressed:", humanize.Bytes(uint64(buf1.Len())))

		var buf2 bytes.Buffer
		var wc io.WriteCloser
		switch 1 {
		case 0:
			wc, err = gzip.NewWriterLevel(&buf2, gzip.BestCompression)
			if err != nil {
				panic(err)
			}
		case 1:
			wc, err = zlib.NewWriterLevel(&buf2, zlib.BestCompression)
			if err != nil {
				panic(err)
			}
		}
		_, err = io.Copy(wc, &buf1)
		if err != nil {
			panic(err)
		}
		err = wc.Close()
		if err != nil {
			panic(err)
		}
		fmt.Println("compressed:", humanize.Bytes(uint64(buf2.Len())))
		fmt.Println()
	}

	printUncompressedAndCompressedSizes(encodeUsingMafsa)
	printUncompressedAndCompressedSizes(encodeUsingJson)
	printUncompressedAndCompressedSizes(encodeUsingNewlines)
	printUncompressedAndCompressedSizes(encodeUsingGob)
	printUncompressedAndCompressedSizes(encodeTrigramUsingGob)
}
