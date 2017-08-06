// Walk the given filesystem path, count the number and size of files.
//
// Similar to running:
//
// 	du -sh path
//
package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/dustin/go-humanize"
)

func main() {
	flag.Parse()

	err := run()
	if err != nil {
		log.Fatalln(err)
	}
}

func run() error {
	var (
		count       uint64
		size        uint64
		sizeWithDir uint64
	)

	root := filepath.Join(os.Getenv("HOME"), "Dropbox")
	err := filepath.Walk(root, func(path string, fi os.FileInfo, err error) error {
		if err != nil {
			log.Printf("can't stat file %s: %v\n", path, err)
			return nil
		}
		count++
		if !fi.IsDir() {
			size += uint64(fi.Size())
		}
		sizeWithDir += uint64(fi.Size())
		return nil
	})
	if err != nil {
		return err
	}

	fmt.Println("file count:", count)
	fmt.Printf("file size: %v (%v)\n", humanize.Bytes(size), size)
	fmt.Printf("file size (with dir): %v (%v)\n", humanize.Bytes(sizeWithDir), sizeWithDir)
	return nil
}
