var api = require('./API.js');

/**
 * Executes a single step of the tank's programming. The tank can only move,
 * turn, or fire its cannon once per turn. Between each update, the tank's
 * engine remains running and consumes 1 fuel. This function will be called
 * repeatedly until there are no more targets left on the grid, or the tank runs
 * out of fuel.
 */

var DirectionEnum = {
    NORTH: 0,
    EAST: 1,
    SOUTH: 2,
    WEST: 3
};

var TileEnum = {
    UNKNOWN: 0,
    EMPTY: 1,
    OBJECT: 2,
    WALL: 3,
    TARGET: 4,
    ENEMY: 5,
    ENEMY_1: 6,
    ENEMY_2: 7
};

var StateEnum = {
    INIT: 0,
    DISCOVERING_POSITION: 1,
    TAKING_POSITION: 2,
    SEARCHING_ENEMIES: 3,
    SEARCHING_TARGET: 4
};

var MAX_DISCOVERY_ROUNDS = 8;

var FUEL_TURN = 1;
var FUEL_FORWARD = 1+FUEL_TURN;
var FUEL_BACKWARD = 1+FUEL_TURN;
var FUEL_LEFT = 5+FUEL_TURN;
var FUEL_RIGHT = 5+FUEL_TURN;
var FUEL_ATTACKED = 50;

var gActionUsed = false;
// we will orient NORTH the initial direction of the tank
var gDirection = DirectionEnum.NORTH;
var gMap = [];
var gWidth = 0;
var gHeight = 0;
var gX = 0;
var gY = 0;
var gDestTile = {x:0, y:0};
var gLidar = [0,0,0,0];

var gState = StateEnum.INIT;

var gFuel = 0;
var gRound = 0;
var gAttacked = false;
var gTargetConfirmed = false;

var getLidar = function() {
    gLidar[gDirection] = api.lidarFront();    
    gLidar[(gDirection+1)%4] = api.lidarRight();
    gLidar[(gDirection+2)%4] = api.lidarBack();
    gLidar[(gDirection+3)%4] = api.lidarLeft();
    console.log("Lidar: "+gLidar);
};

var createMap = function(width, height) {
    var result = new Array(width);
    for (var i=0; i<width; i++) {
        var col = new Array(height);
        for (var j=0; j<height; j++) {
            col[j] = { reachable: false, value: TileEnum.UNKNOWN};
        }
        result[i] = col;
    }
    return result;
};

var initMap = function() {
    // scanning in all direction
    getLidar();
    // create the initial map
    gWidth = gLidar[DirectionEnum.EAST]+gLidar[DirectionEnum.WEST]+1;
    gHeight = gLidar[DirectionEnum.NORTH]+gLidar[DirectionEnum.SOUTH]+1;
    gMap = createMap(gWidth,gHeight);
    // init our coordinates
    gX = gLidar[DirectionEnum.WEST];
    gY = gLidar[DirectionEnum.SOUTH];
    gDestTile = {x: gX, y: gY};
    // init the first visible tiles on map
    setTile(gX,0,TileEnum.OBJECT);
    for (var i=1; i<gLidar[DirectionEnum.NORTH]+gLidar[DirectionEnum.SOUTH]; i++) {
    	setTile(gX,i,TileEnum.EMPTY);
    }
    setTile(gX,gLidar[DirectionEnum.NORTH]+gLidar[DirectionEnum.SOUTH],TileEnum.OBJECT);
    setTile(0,gY,TileEnum.OBJECT);
    for (var j=1; j<gLidar[DirectionEnum.EAST]+gLidar[DirectionEnum.WEST]; j++) {
        setTile(j,gY,TileEnum.EMPTY);
    }
    setTile(gLidar[DirectionEnum.EAST]+gLidar[DirectionEnum.WEST],gY,TileEnum.OBJECT);
    // switching to next state
    gState = StateEnum.DISCOVERING_POSITION;
    gFuel = api.currentFuel();

    printMap(gMap);
    console.log("Starting fuel: "+gFuel);
};

var setTile = function(x,y,val) {
	if (gMap[x][y].value === TileEnum.ENEMY) {
		// TODO: mark the orange enemy on line and column
		console.log("Enemy disappeared...");
	}
	gMap[x][y] = {reachable: true, value: val};
	if (val === TileEnum.EMPTY) {
		gMap[x-1][y].reachable = true;
		gMap[x+1][y].reachable = true;
		gMap[x][y-1].reachable = true;
		gMap[x][y+1].reachable = true;
	}
};

var updateMap = function() {
    var toBeIncreased = false;
    var tX = 0, tY = 0;
    var uX = 0, uY = 0;

    getLidar();

    if (gY-gLidar[DirectionEnum.SOUTH]<0) {
        tY += gLidar[DirectionEnum.SOUTH] - gY;
        toBeIncreased = true;
        console.log("SOUTH: new tY "+tY);
    }
    if (gX-gLidar[DirectionEnum.WEST]<0) {
        tX += gLidar[DirectionEnum.WEST] - gX;
        toBeIncreased = true;
        console.log("WEST: new tX "+tX);
    }
    if (gY+gLidar[DirectionEnum.NORTH]+1>gHeight) {
        uY += gY+gLidar[DirectionEnum.NORTH]+1-gHeight;
        toBeIncreased = true;
        console.log("NORTH: new uY "+uY);
    }
    if (gX+gLidar[DirectionEnum.EAST]+1>gWidth) {
        uX += gX+gLidar[DirectionEnum.EAST]+1-gWidth;
        toBeIncreased = true;
        console.log("EAST: new uX "+uX);
    }
    if (toBeIncreased) {
    	gMap = increaseMap(tX, tY, gWidth+tX+uX, gHeight+tY+uY);
    }
    
    // updating column taking into account previous state
    if (gMap[gX][gY-gLidar[DirectionEnum.SOUTH]].value === TileEnum.EMPTY) {
    	gMap[gX][gY-gLidar[DirectionEnum.SOUTH]] = {reachable: true, value: TileEnum.ENEMY};
    } else if (gMap[gX][gY-gLidar[DirectionEnum.SOUTH]].value === TileEnum.OBJECT) {
    	gMap[gX][gY-gLidar[DirectionEnum.SOUTH]] = {reachable: true, value: TileEnum.TARGET};
    } else if (gMap[gX][gY-gLidar[DirectionEnum.SOUTH]].value === TileEnum.UNKNOWN) {
    	gMap[gX][gY-gLidar[DirectionEnum.SOUTH]] = {reachable: true, value: TileEnum.OBJECT};
    } else {
        //console.log("Col Down: "+gMap[gX][gY-gLidar[DirectionEnum.SOUTH]]);
    }
    for (var i=gY-gLidar[DirectionEnum.SOUTH]+1; i<gY+gLidar[DirectionEnum.NORTH]; i++) {
        setTile(gX,i,TileEnum.EMPTY);
    }
    if (gMap[gX][gY+gLidar[DirectionEnum.NORTH]].value === TileEnum.EMPTY) {
    	gMap[gX][gY+gLidar[DirectionEnum.NORTH]] = {reachable: true, value: TileEnum.ENEMY};
    } else if (gMap[gX][gY+gLidar[DirectionEnum.NORTH]].value === TileEnum.OBJECT) {
    	gMap[gX][gY+gLidar[DirectionEnum.NORTH]] = {reachable: false, value: TileEnum.TARGET};
    } else if (gMap[gX][gY+gLidar[DirectionEnum.NORTH]].value === TileEnum.UNKNOWN) {
    	gMap[gX][gY+gLidar[DirectionEnum.NORTH]] = {reachable: false, value: TileEnum.OBJECT};
    } else {
        //console.log("Col Up: "+gMap[gX][gY+gLidar[DirectionEnum.NORTH]]);
    }

    // updating column taking into account previous state
    if (gMap[gX-gLidar[DirectionEnum.WEST]][gY].value === TileEnum.EMPTY) {
    	gMap[gX-gLidar[DirectionEnum.WEST]][gY] = {reachable: true, value: TileEnum.ENEMY};
    } else if (gMap[gX-gLidar[DirectionEnum.WEST]][gY].value === TileEnum.OBJECT) {
    	gMap[gX-gLidar[DirectionEnum.WEST]][gY] = {reachable: false, value: TileEnum.TARGET};
    } else if (gMap[gX-gLidar[DirectionEnum.WEST]][gY].value === TileEnum.UNKNOWN) {
    	gMap[gX-gLidar[DirectionEnum.WEST]][gY] = {reachable: false, value: TileEnum.OBJECT};
    } else {
        //console.log("Line Left: "+gMap[gX-gLidar[DirectionEnum.WEST]][gY]);
    }
    for (var j=gX-gLidar[DirectionEnum.WEST]+1; j<gX+gLidar[DirectionEnum.EAST]; j++) {
        setTile(j,gY,TileEnum.EMPTY);
    }
    if (gMap[gX+gLidar[DirectionEnum.EAST]][gY].value === TileEnum.EMPTY) {
    	gMap[gX+gLidar[DirectionEnum.EAST]][gY] = {reachable: true, value: TileEnum.ENEMY};
    } else if (gMap[gX+gLidar[DirectionEnum.EAST]][gY].value === TileEnum.OBJECT) {
    	gMap[gX+gLidar[DirectionEnum.EAST]][gY] = {reachable: false, value: TileEnum.TARGET};
    } else if (gMap[gX+gLidar[DirectionEnum.EAST]][gY].value === TileEnum.UNKNOWN) {
    	gMap[gX+gLidar[DirectionEnum.EAST]][gY] = {reachable: false, value: TileEnum.OBJECT};
    } else {
        //console.log("Line Right: "+gMap[gX+gLidar[DirectionEnum.EAST]][gY]);
    }

    if (api.currentFuel() < (gFuel - FUEL_ATTACKED)) {
    	gAttacked = true;
    	console.log("Attacked!!!");
    } else {
    	gAttacked = false;
    }
    gFuel = api.currentFuel();
    gRound++;

    console.log("x: "+gX+", y: "+gY+"dir: "+gDirection);
    printMap(gMap);
    console.log("Current fuel: "+gFuel);
};

var increaseMap = function(tX, tY, newWidth, newHeight) {
    var result = createMap(newWidth, newHeight);
    for(var i=0; i<gWidth; i++) {
        for (j=0; j<gHeight; j++) {
            result[i+tX][j+tY] = gMap[i][j];
        }
    }
    gWidth = newWidth;
    gHeight = newHeight;
    gX += tX;
    gY += tY;
    return result;
};

var printMap = function(map) {
    for(var i=0; i<gHeight; i++) {
        var s = "";
        for (j=0; j<gWidth; j++) {
            s+=map[j][gHeight-1-i].value;
        }
        console.log(s);
    }
};

var scanMap = function(map) {
	var result = 0;
    for(var i=0; i<gWidth; i++) {
        for (j=0; j<gHeight; j++) {
            if (gMap[i][j].value === TileEnum.ENEMY) {
            	result++;
            }
        }
    }
    return result;
};

var moveForward = function() {
	if (gActionUsed) {
		return;
	}
	gActionUsed = true;
	console.log("Going Forward!");
    switch(gDirection) {
        case DirectionEnum.NORTH:
            gY++;
            break;
        case DirectionEnum.EAST:
            gX++;
            break;
        case DirectionEnum.SOUTH:
            gY--;
            break;
        case DirectionEnum.WEST:
            gX--;
            break;
    }
    api.moveForward();
};

var moveBackward = function() {
	if (gActionUsed) {
		return;
	}
	gActionUsed = true;
	console.log("Going Backward!");	
    switch(gDirection) {
        case DirectionEnum.NORTH:
        	gY--;
            break;
        case DirectionEnum.EAST:
        	gX--;
            break;
        case DirectionEnum.SOUTH:
        	gY++;
            break;
        case DirectionEnum.WEST:
        	gX++;
            break;
    }
    api.moveBackward();
};

var turnLeft = function() {
	if (gActionUsed) {
		return;
	}
	gActionUsed = true;
	console.log("Turning Left!");	
    gDirection = (gDirection+3)%4;
    api.turnLeft();
};

var turnRight = function() {
	if (gActionUsed) {
		return;
	}
	gActionUsed = true;
	console.log("Turning Right!");	
    gDirection = (gDirection+1)%4;
    api.turnRight();
};

var fireCannon = function() {
	if (gActionUsed) {
		return;
	}
	gActionUsed = true;
	console.log("Fire !!!");
    api.fireCannon();
};

var identifyTarget = function() {

};

var seekAndDestroy = function() {
    switch(gDirection) {
        case DirectionEnum.NORTH:
        	console.log("seekAndDestroy NORTH");
            if (gMap[gX+gLidar[DirectionEnum.EAST]][gY].value === TileEnum.ENEMY) {
                turnRight();
            } else {
                turnLeft();
            }
            break;
        case DirectionEnum.EAST:
        	console.log("seekAndDestroy EAST");
            if (gMap[gX][gY-gLidar[DirectionEnum.SOUTH]].value === TileEnum.ENEMY) {
                turnRight();
            } else {
                turnLeft();
            }
            break;
        case DirectionEnum.SOUTH:
        	console.log("seekAndDestroy SOUTH");
            if (gMap[gX-gLidar[DirectionEnum.WEST]][gY].value === TileEnum.ENEMY) {
                turnRight();
            } else {
                turnLeft();
            }
            break;
        case DirectionEnum.WEST:
        	console.log("seekAndDestroy WEST");
            if (gMap[gX][gY+gLidar[DirectionEnum.NORTH]].value === TileEnum.ENEMY) {
                turnRight();
            } else {
                turnLeft();
            }
            break;
        default:
        	console.log("seekAndDestroy Unknown direction: "+gDirection);
    }
};

var discoveringPosition = function() {
	if (gRound > MAX_DISCOVERY_ROUNDS) {
		gState = StateEnum.TAKING_POSITION;
		gPositionTile = getPositionTile(gMap);
	    console.log("Taking Position:");
	    printTile(gPositionTile);
		getShortestPath(gPositionTile.x, gPositionTile.y);
	    console.log("Position Path:");
	    printPath(gSearchPath);
	}
};

var takePosition = function() {

};

var	gSearchPath = {found: false, fuelUsed: 0, step: 0, steps: []};

var lookForEnemies = function() {
	if (checkLidarTiles()) {
		return;
	}
	if (gSearchPath.step === gSearchPath.steps.length) {
	    gDestTile = getNextTargetTile(gMap);
	    if (!gDestTile) {
	    	return;
	    }
	    console.log("Next destination:");
	    printTile(gDestTile);
		getShortestPath(gDestTile.x, gDestTile.y);
	    console.log("Next path:");
	    printPath(gSearchPath);
	} else {
		performNextStep(gSearchPath);
	}
};

var printTile = function(tile) {
	console.log(tile.x+","+tile.y);
};

var printPath = function(path) {
    for(var i=0; i<path.steps.length; i++) {
    	var step = i+1;
		console.log("Step "+step);
		printTile(path.steps[i]);        
    }
};

var checkLidarTiles = function() {
	if (gMap[gX][gY+gLidar[DirectionEnum.NORTH]].value === TileEnum.OBJECT) {
		return true;
	}
	if (gMap[gX][gY-gLidar[DirectionEnum.SOUTH]].value === TileEnum.OBJECT) {
		return true;
	}
	if (gMap[gX-gLidar[DirectionEnum.WEST]][gY].value === TileEnum.OBJECT) {
		return true;
	}
	if (gMap[gX+gLidar[DirectionEnum.EAST]][gY].value === TileEnum.OBJECT) {
		return true;
	}
	return false;
};

var getNextTargetTile = function(map) {
	var distance = 1;
	var maxDistance = computeMaxDistance(gX,gY);
	var result = {found: false};
	while ((!result.found)&&(distance<=maxDistance)) {
		result = checkTargetAtDistance(distance);
		distance++;
	}
	if (!result.found) {
    	gState = StateEnum.SEARCHING_TARGET;
    	return null;
	}
	return result.tile;
};

var computeMaxDistance = function(x,y) {
	return Math.max(
		x,
		gWidth-x-1,
		y,
		gHeight-y-1);
};

var checkTargetAtDistance = function(distance) {
	console.log("checkTargetAtDistance: "+gX+","+gY+" at distance "+distance);
    switch(gDirection) {
        case DirectionEnum.NORTH:
        	for (i=1; i<=distance; i++) {
		    	if (isTargetReachable(gX-i,gY+distance-i)) {
		    		return {found: true, tile:{x:gX-i, y:gY+distance-i}};
		    	}
		    	if (isTargetReachable(gX+i,gY+distance-i)) {
		    		return {found: true, tile:{x:gX+i, y:gY+distance-i}};
		    	}
	        	if (isTargetReachable(gX-i,gY-distance+i)) {
	        		return {found: true, tile:{x:gX-i, y:gY-distance+i}};
	        	}
	        	if (isTargetReachable(gX+i,gY-distance+i)) {
	        		return {found: true, tile:{x:gX+i, y:gY-distance+i}};
	        	}
        	}
            break;
        case DirectionEnum.EAST:
        	for (i=1; i<=distance; i++) {
		    	if (isTargetReachable(gX+distance-i,gY-i)) {
		    		return {found: true, tile:{x:gX+distance-i, y:gY-i}};
		    	}
		    	if (isTargetReachable(gX+distance-i,gY+i)) {
		    		return {found: true, tile:{x:gX+distance-i, y:gY+i}};
		    	}
	        	if (isTargetReachable(gX-distance+i,gY-i)) {
	        		return {found: true, tile:{x:gX-distance+i, y:gY-i}};
	        	}
	        	if (isTargetReachable(gX-distance+i,gY+i)) {
	        		return {found: true, tile:{x:gX-distance+i, y:gY+i}};
	        	}
        	}
            break;
        case DirectionEnum.SOUTH:
        	for (i=1; i<=distance; i++) {
	        	if (isTargetReachable(gX-i,gY-distance+i)) {
	        		return {found: true, tile:{x:gX-i, y:gY-distance+i}};
	        	}
	        	if (isTargetReachable(gX+i,gY-distance+i)) {
	        		return {found: true, tile:{x:gX+i, y:gY-distance+i}};
	        	}
		    	if (isTargetReachable(gX-i,gY+distance-i)) {
		    		return {found: true, tile:{x:gX-i, y:gY+distance-i}};
		    	}
		    	if (isTargetReachable(gX+i,gY+distance-i)) {
		    		return {found: true, tile:{x:gX+i, y:gY+distance-i}};
		    	}
        	}
            break;
        case DirectionEnum.WEST:
        	for (i=1; i<=distance; i++) {
	        	if (isTargetReachable(gX-distance+i,gY-i)) {
	        		return {found: true, tile:{x:gX-distance+i, y:gY-i}};
	        	}
	        	if (isTargetReachable(gX-distance+i,gY+i)) {
	        		return {found: true, tile:{x:gX-distance+i, y:gY+i}};
	        	}
		    	if (isTargetReachable(gX+distance-i,gY-i)) {
		    		return {found: true, tile:{x:gX+distance-i, y:gY-i}};
		    	}
		    	if (isTargetReachable(gX+distance-i,gY+i)) {
		    		return {found: true, tile:{x:gX+distance-i, y:gY+i}};
		    	}
        	}
            break;
    }
    return {found: false};
};

var isTargetReachable = function(x, y) {
	if (x<0 || x>=gWidth) {
		return false;
	}
	if (y<0 || y>=gHeight) {
		return false;
	}
	tile = gMap[x][y];
	return (tile.value === TileEnum.UNKNOWN)&&(tile.reachable === true);
};

var isTileReachable = function(x, y) {
	if (x<0 || x>=gWidth) {
		return false;
	}
	if (y<0 || y>=gHeight) {
		return false;
	}
	tile = gMap[x][y];
	return (tile.value === TileEnum.EMPTY)&&(tile.reachable === true);
};

var gCandidates;

var getShortestPath = function(x, y) {
	console.log("Computing Candidates: ");
	gCandidates = computeCandidates(x, y);
	console.log("Candidates: ");
	for (var i = gCandidates.length - 1; i >= 0; i--) {
		printTile(gCandidates[i]);
	}
	gSearchPath = {found: false, fuelUsed: 0, step: 0, steps: []};
	initSearchMap();
	searchMapForward(gX, gY, gDirection, 0, []);
	searchMapLeft(gX,gY, gDirection, 0, []);
	searchMapRight(gX,gY, gDirection, 0, []);
	searchMapBackward(gX,gY, gDirection, 0, []);
	return gSearchPath;
};

// TODO, can be optimized to place highest priority on certain tile depending on direction
var computeCandidates = function(x, y) {
	result = [];
	var i=1;
	while(isTileReachable(x+i,y)) {
		result.push({x:x+i,y:y});
		i++;
	}
	i=1;
	while(isTileReachable(x-i,y)) {
		result.push({x:x-i,y:y});
		i++;
	}
	i=1;
	while(isTileReachable(x,y+i)) {
		result.push({x:x,y:y+i});
		i++;
	}
	i=1;
	while(isTileReachable(x,y-i)) {
		result.push({x:x,y:y-i});
		i++;
	}
	return result;
};

var isCandidate = function(x, y) {
	for (var i=0; i<gCandidates.length; i++) {
		if ((gCandidates[i].x === x) && (gCandidates[i].y === y)) {
			return true;
		}
	}
	return false;
};

var initSearchMap = function() {
    for(var i=0; i<gWidth; i++) {
        for (j=0; j<gHeight; j++) {
        	delete gMap[i][j].searched;
        	delete gMap[i][j].fuelUsed;
        	delete gMap[i][j].steps;
        }
    }
};

// could be optimized will parallel computing... or taking into account search direction...
var searchMapForward = function(x, y, direction, fuel, path) {
	switch(direction) {
		case DirectionEnum.NORTH:
			y++;
			break;
		case DirectionEnum.SOUTH:
			y--;
			break;
		case DirectionEnum.EAST:
			x++;
			break;
		case DirectionEnum.WEST:
			x--;
			break;
	}
	fuel += FUEL_FORWARD;
	searchMapMove(x, y, direction, fuel, path);
};

var searchMapLeft = function(x, y, direction, fuel, path) {
	switch(direction) {
		case DirectionEnum.NORTH:
			x--;
			break;
		case DirectionEnum.SOUTH:
			x++;
			break;
		case DirectionEnum.EAST:
			y++;
			break;
		case DirectionEnum.WEST:
			y--;
			break;
	}
	direction = (direction+3)%4;
	fuel += FUEL_LEFT;
	searchMapMove(x, y, direction, fuel, path);
};

var searchMapBackward = function(x, y, direction, fuel, path) {
	switch(direction) {
		case DirectionEnum.NORTH:
			y--;
			break;
		case DirectionEnum.SOUTH:
			y++;
			break;
		case DirectionEnum.EAST:
			x--;
			break;
		case DirectionEnum.WEST:
			x++;
			break;
	}
	fuel += FUEL_BACKWARD;
	searchMapMove(x, y, direction, fuel, path);
};

var searchMapRight = function(x, y, direction, fuel, path) {
	switch(direction) {
		case DirectionEnum.NORTH:
			x++;
			break;
		case DirectionEnum.SOUTH:
			x--;
			break;
		case DirectionEnum.EAST:
			y--;
			break;
		case DirectionEnum.WEST:
			y++;
			break;
	}
	direction = (direction+1)%4;
	fuel += FUEL_RIGHT;
	searchMapMove(x, y, direction, fuel, path);
};

var searchMapMove = function(x, y, direction, fuel, path) {
	if (gMap[x][y].value !== TileEnum.EMPTY) {
		return;
	}
	if (!gMap[x][y].searched) {
		path.push({x:x, y:y});
		gMap[x][y].searched = true;
		gMap[x][y].fuelUsed = fuel;
		gMap[x][y].steps = path.slice();
		if (isCandidate(x, y)) {
			if (gSearchPath.found) {
				if (gSearchPath.fuelUsed > fuel) {
					gSearchPath.fuelUsed = fuel;
					gSearchPath.steps = path.slice();
				}				
			} else {
				gSearchPath.found = true;
				gSearchPath.fuelUsed = fuel;
				gSearchPath.steps = path.slice();
			}
			return;
		}
	} else {
		if (gMap[x][y].fuelUsed <= fuel) {
			return;
		}
		path.push({x:x, y:y});
		gMap[x][y].fuelUsed = fuel;
		gMap[x][y].steps = path.slice();
		if (isCandidate(x, y)) {
			if (gSearchPath.found) {
				if (gSearchPath.fuelUsed > fuel) {
					gSearchPath.fuelUsed = fuel;
					gSearchPath.steps = path.slice();
				}				
			} else {
				gSearchPath.found = true;
				gSearchPath.fuelUsed = fuel;
				gSearchPath.steps = path.slice();
			}
			return;
		}
	}
	searchMapForward(x, y, direction, fuel, path.slice());
	searchMapLeft(x, y, direction, fuel, path.slice());
	searchMapRight(x, y, direction, fuel, path.slice());
	searchMapBackward(x, y, direction, fuel, path.slice());	
};

var performNextStep = function(path) {
	var tile = path.steps[path.step];
	if (performMoveTo(tile)) {
		path.step++;	
	}
};

// Can be optimized with Matrices computation probably...
var performMoveTo = function(tile) {
	var goingTo;
	if (tile.x < gX) {
		goingTo = DirectionEnum.WEST;
	} else if (tile.x > gX) {
		goingTo = DirectionEnum.EAST;
	} else if (tile.y < gY) {
		goingTo = DirectionEnum.SOUTH;
	} else if (tile.y > gY) {
		goingTo = DirectionEnum.NORTH;
	} else {
		console.log("Impossible move...");
	}

	switch(gDirection) {
		case DirectionEnum.NORTH:
			switch(goingTo) {
				case DirectionEnum.NORTH:
					moveForward();
					return true;
				case DirectionEnum.SOUTH:
					moveBackward();
					return true;
				case DirectionEnum.EAST:
					turnRight();
					return false;
				case DirectionEnum.WEST:
					turnLeft();
					return false;
			}
		case DirectionEnum.SOUTH:
			switch(goingTo) {
				case DirectionEnum.NORTH:
					moveBackward();
					return true;
				case DirectionEnum.SOUTH:
					moveForward();
					return true;
				case DirectionEnum.EAST:
					turnLeft();
					return false;
				case DirectionEnum.WEST:
					turnRight();
					return false;
			}
		case DirectionEnum.EAST:
			switch(goingTo) {
				case DirectionEnum.NORTH:
					turnLeft();
					return false;
				case DirectionEnum.SOUTH:
					turnRight();
					return false;
				case DirectionEnum.EAST:
					moveForward();
					return true;
				case DirectionEnum.WEST:
					moveBackward();
					return true;
			}
		case DirectionEnum.WEST:
			switch(goingTo) {
				case DirectionEnum.NORTH:
					turnRight();
					return false;
				case DirectionEnum.SOUTH:
					turnLeft();
					return false;
				case DirectionEnum.EAST:
					moveBackward();
					return true;
				case DirectionEnum.WEST:
					moveForward();
					return true;
			}
	}
};

var lookForTarget = function() {

};

exports.update = function() {
	gActionUsed = false;
    if (gState === StateEnum.INIT) {
    	console.log("Battle begin!");
        initMap();
    } else {
    	console.log("======= Round: "+gRound+" =======");
        updateMap();
    }
    if (identifyTarget()) {
    	if (gTargetConfirmed) {
        	fireCannon();
    	}
    } else {
        switch(gDirection) {
            case DirectionEnum.NORTH:
                gMap[gX][gY+gLidar[gDirection]] = {reachable: false, value: TileEnum.WALL};
                break;
            case DirectionEnum.EAST:
                gMap[gX+gLidar[gDirection]][gY] = {reachable: false, value: TileEnum.WALL};
                break;
            case DirectionEnum.SOUTH:
                gMap[gX][gY-gLidar[gDirection]] = {reachable: false, value: TileEnum.WALL};
                break;
            case DirectionEnum.WEST:
                gMap[gX-gLidar[gDirection]][gY] = {reachable: false, value: TileEnum.WALL};
                break;
        }
    }
    if (isEnemyInSight(x, y) || gAttacked) {
        console.log("Seek and Destroy!");
        seekAndDestroy();
    }
    if (gState === StateEnum.OPTIMIZING_POSITION) {
        console.log("Optimizing Position");
    	optimizePosition();
    }
    if (gState === StateEnum.TAKING_POSITION) {
    	console.log("Taking Position");
    	takePosition();
    }
    if (gState === StateEnum.SEARCHING_ENEMIES) {
        console.log("Searching Enemies");
    	lookForEnemies();
    }
    if (gState === StateEnum.SEARCHING_TARGET) {
        console.log("Searching Target");
    	lookForTarget();
    }
};
