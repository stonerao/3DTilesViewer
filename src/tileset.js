import {Cache} from "./cache/cache";
import { loader } from "./loader/loader";
import * as THREE from 'three';

console.log(navigator.deviceMemory);

const cache = new Cache(8e8, loader);
function Tileset(url, scene, camera, geometricErrorMultiplier){
    var self = this;
    this.rootTile;
    if(!!scene) this.scene = scene;
    this.camera = camera;
    this.geometricErrorMultiplier = !!geometricErrorMultiplier?geometricErrorMultiplier:1;
    this.currentlyRenderedTiles = {};
    this.futureActionOnTiles = {};

    this.cancelCurrentUpdate;

    loader(url).then(rootTile => {
        self.rootTile = rootTile;
        update();
    });

    function deleteFromCurrentScene(){
        self.cancelCurrentUpdate();
        if(!!self.scene){
            self.currentlyRenderedTiles.values().forEach(element => {
                self.scene.remove(element.scene);
            });
        }
        self.currentlyRenderedTiles = {}
    }
    function setScene(scene){
        deleteFromCurrentScene();
        self.scene = scene;
        update();
    }

    function setCamera(camera){
        self.camera = camera;
    }

    function update(){
        if(!!self.controller){
            //self.controller.abort();
        }
        let controller = new AbortController();
        self.controller = controller;
        
        var frustum = new THREE.Frustum();
        self.camera.updateMatrix(); 
        self.camera.updateMatrixWorld();
        var projScreenMatrix = new THREE.Matrix4();
        projScreenMatrix.multiplyMatrices( self.camera.projectionMatrix, self.camera.matrixWorldInverse );
        frustum.setFromProjectionMatrix( new THREE.Matrix4().multiplyMatrices( self.camera.projectionMatrix, self.camera.matrixWorldInverse ) );

        
        if(!self.rootTile) {
            return;
        }
        self.rootTile.getTilesInView(frustum, camera.position, self.geometricErrorMultiplier, controller.signal).then(tiles=>{
            let newTilesContent = tiles.map(tile=>tile.content);
            let toDelete=[];
            Object.keys(self.currentlyRenderedTiles).forEach(current=>{
                if(!newTilesContent.includes(current)){
                    self.futureActionOnTiles[current] = "toDelete";
                    toDelete.push(current);
                }
            });
            var contentRequests=[];
            newTilesContent.forEach(content=>{
                if(!self.currentlyRenderedTiles[content] && self.futureActionOnTiles[content] !== "toUpdate"){
                    self.futureActionOnTiles[content] = "toUpdate";
                    contentRequests.push(cache.get(content, controller.signal).then(gltf=>{
                        if(!!gltf){
                            if(self.futureActionOnTiles[content] === "toUpdate"){
                                self.scene.add(gltf.model.scene);
                                self.currentlyRenderedTiles[content] = gltf.model;
                                delete self.futureActionOnTiles[content];
                            }
                        }
                    }).catch(error=>{
                        console.error( error);
                    }));
                }else if(!!self.futureActionOnTiles[content]){
                    delete self.futureActionOnTiles[content];
                }
            });
            Promise.all(contentRequests).finally(()=>{
                if(!controller.signal.aborted){
                    toDelete.forEach(url=>{
                        setTimeout(()=>{
                            if(self.futureActionOnTiles[url] === "toDelete"){
                                self.scene.remove(self.currentlyRenderedTiles[url].scene);
                                delete self.currentlyRenderedTiles[url];
                                delete self.futureActionOnTiles[url];
                            }
                        }, 10);
                    })
                }
                
            });
        });

        
    }

    
    return{
        "setScene" : setScene,
        "update" : update,
        "setCamera" : setCamera,
        "deleteFromCurrentScene" : deleteFromCurrentScene
    }
}

export {Tileset};