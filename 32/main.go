// Play with net/rpc, compare performance of local calculations vs. rpc calculations on localhost.
package main

import (
	"fmt"
	"log"
	"net"
	"net/http"
	"net/rpc"
	"time"

	"github.com/bradfitz/iter"
)

const (
	times = 100000
	laddr = "localhost:8080"
	raddr = "localhost:8080"
)

var (
	arith = new(Arith)
)

type Args struct {
	A, B int
}

type Arith struct{}

func (_ *Arith) Multiply(args *Args, reply *int) error {
	*reply = args.A * args.B
	return nil
}

func local() {
	started := time.Now()
	args := &Args{7, 8}
	var reply int
	for _ = range iter.N(times) {
		err := arith.Multiply(args, &reply)
		if err != nil {
			log.Fatal("arith error:", err)
		}
	}
	fmt.Printf("Arith: %d*%d=%d taken %v\n", args.A, args.B, reply, time.Since(started).String())
}

func remoteServe() {
	rpc.Register(arith)
	rpc.HandleHTTP()
	l, e := net.Listen("tcp", laddr)
	if e != nil {
		log.Fatal("listen error:", e)
	}
	go http.Serve(l, nil)
}

func remoteSync() {
	client, err := rpc.DialHTTP("tcp", raddr)
	if err != nil {
		log.Fatal("dialing:", err)
	}

	started := time.Now()
	args := &Args{7, 8}
	var reply int
	for _ = range iter.N(times) {
		err = client.Call("Arith.Multiply", args, &reply)
		if err != nil {
			log.Fatal("arith error:", err)
		}
	}
	fmt.Printf("Arith: %d*%d=%d taken %v\n", args.A, args.B, reply, time.Since(started).String())

	_ = client.Close()
}

func remoteAsync() {
	client, err := rpc.DialHTTP("tcp", raddr)
	if err != nil {
		log.Fatal("dialing:", err)
	}

	calls := make(chan *rpc.Call, times)

	started := time.Now()
	args := &Args{7, 8}
	var reply int
	for _ = range iter.N(times) {
		client.Go("Arith.Multiply", args, &reply, calls)
	}
	for _ = range iter.N(times) {
		<-calls
	}
	fmt.Printf("Arith: %d*%d=%d taken %v\n", args.A, args.B, reply, time.Since(started).String())

	_ = client.Close()
}

func main() {
	local()

	remoteServe()
	remoteAsync()
	remoteSync()
}
