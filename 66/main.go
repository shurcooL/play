package main

import (
	"fmt"
	"log"

	"github.com/go-fsnotify/fsnotify"
)

func main() {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		log.Fatal(err)
	}
	defer watcher.Close()

	out := make(chan string)
	go func() {
		for s := range out {
			fmt.Println("REAL OUT:", s)
		}
	}()

	done := make(chan bool)
	go func() {
		for {
			select {
			case e := <-watcher.Events:
				switch {
				case e.Op&fsnotify.Create != 0 && e.Name == "test.html":
					log.Println("./test.html recreated:", e)
				case e.Op&fsnotify.Chmod != 0:
					log.Println("event (Chmod):", e)
				case e.Name == "test.html":
					out <- "test.html event"
				default:
					log.Println("event:", e)
				}
			case err := <-watcher.Errors:
				log.Println("error:", err)
			}
		}

	}()

	err = watcher.Add("./")
	if err != nil {
		panic(err)
	}
	err = watcher.Add("./test.html")
	if err != nil {
		panic(err)
	}
	<-done
}
