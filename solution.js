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
    ENEMY: 5
};

var StateEnum = {
    INIT: 0,
    SEARCHING_POSITION: 1,
    TAKING_POSITION: 2,
    SEARCHING_ENEMY: 3,
    SEARCHING_TARGET: 4
};

var MAX_DISCOVERY_ROUNDS = 7;
var MAX_HOLDING_POSITION = MAX_DISCOVERY_ROUNDS+16;
var MAX_HOLDING_INCREASE = 2;

var FUEL_IDLE = 1;
var FUEL_MOVE = 1+FUEL_IDLE;
var FUEL_TURN = 1+FUEL_IDLE;
var FUEL_ATTACKED = 50;

var gDirection = DirectionEnum.NORTH;
var gMap = [];
var gWidth = 0;
var gHeight = 0;
var gX = 0;
var gY = 0;
var gLidar = [0,0,0,0];

var gState = StateEnum.INIT;

var gFuel = 0;
var gRound = 1;

var	gPath = null;
var gCandidates = [];
var gAvoidTarget = true;

var gAttacked = false;
var gHoldLonger = 0;

// TODO: if an object is inside the map, it could be worth to identify it ASAP
// TODO: during searching enemy phase, make a choice between next enemy and exploration depending on distance
// TODO: during enemy phase, viewCondition is not sufficient, we must explore each segment (vertical and horizontal) once!
// TODO: take into account gAttacked !!

//---------------------------------------------------------------------------
// Update Function
//---------------------------------------------------------------------------
exports.update = function() {
	try {
	    if (gState === StateEnum.INIT) {
	    	console.log("Battle begin!");
	    	console.log("======= Round: "+gRound+" =======");
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
	                setTile(gX,gY+gLidar[gDirection],TileEnum.WALL);
	                break;
	            case DirectionEnum.EAST:
	                setTile(gX+gLidar[gDirection],gY,TileEnum.WALL);
	                break;
	            case DirectionEnum.SOUTH:
	                setTile(gX,gY-gLidar[gDirection],TileEnum.WALL);
	                break;
	            case DirectionEnum.WEST:
	                setTile(gX-gLidar[gDirection],gY,TileEnum.WALL);
	                break;
	        }
	    }
	    if (gState === StateEnum.SEARCHING_POSITION) {
	    	while (gState === StateEnum.SEARCHING_POSITION) {
		        console.log("Seek and Destroy Enemy!!!");
		    	seekAndDestroy(TileEnum.ENEMY);
	        	console.log("Discovering Position");
	    		discoverPosition();
	    	}
	    }
	    if (gState === StateEnum.TAKING_POSITION) {
			var limitRound = MAX_HOLDING_POSITION+gHoldLonger;
			console.log("Keeping position until round "+limitRound);
	    	while (gState === StateEnum.TAKING_POSITION) {
		        console.log("Seek and Destroy Enemy!!!");
		    	seekAndDestroy(TileEnum.ENEMY);
		    	console.log("Taking Position");
		    	takePosition();
		    }
	    }
	    if (gState === StateEnum.SEARCHING_ENEMY) {
	    	while (gState === StateEnum.SEARCHING_ENEMY) {
		        console.log("Seek and Destroy Enemy!!!");
		    	seekAndDestroy(TileEnum.ENEMY);
		        console.log("Seek and Destroy Object!!!");
		    	seekAndDestroy(TileEnum.OBJECT);
		        //console.log("Seek and Destroy Target!!!");
		    	//seekAndDestroy(TileEnum.TARGET);
		    	console.log("Searching Enemy");
		    	lookForEnemy();
	    	}
	    }
	    if (gState === StateEnum.SEARCHING_TARGET) {
	    	while (gState === StateEnum.SEARCHING_TARGET) {
		        console.log("Seek and Destroy Target!!!");
			    seekAndDestroy(TileEnum.TARGET);
		    	console.log("Searching Target");
		    	lookForTarget();
			}
	    }
	} catch(e) {
		if (e.isAction) {
			console.log(e.action);
			console.log("Ending turn...");			
		} else {
			console.log("Shit happened...");
			throw(e);
		}
	}
};

//---------------------------------------------------------------------------
// Wrapper to API functions
//---------------------------------------------------------------------------

var getLidar = function() {
    gLidar[gDirection] = api.lidarFront();    
    gLidar[(gDirection+1)%4] = api.lidarRight();
    gLidar[(gDirection+2)%4] = api.lidarBack();
    gLidar[(gDirection+3)%4] = api.lidarLeft();
    //console.log("Lidar: "+gLidar);
};

var identifyTarget = function() {
	// we confirmed a target if the enemy is on the next tile (both type 1&2)
	// and if we check a progressing enemy (type 2)
	if (api.identifyTarget()) {
		var x = 0;
		var y = 0;
	    switch(gDirection) {
	        case DirectionEnum.NORTH:
	        	x = gX;
	        	y = gY+gLidar[gDirection];
	            break;
	        case DirectionEnum.EAST:
	        	x = gX+gLidar[gDirection];
	        	y = gY;
	            break;
	        case DirectionEnum.SOUTH:
	        	x = gX;
	        	y = gY-gLidar[gDirection];
	            break;
	        case DirectionEnum.WEST:
	        	x = gX-gLidar[gDirection];
	        	y = gY;
	            break;
	    }
	    var value = gMap[x][y].value;

	    if (value === TileEnum.ENEMY) {
	    	gTargetConfirmed = true;
	    } else {
	    	if (gLidar[gDirection] === 1) {
	    		gTargetConfirmed = true;
	    	} else {
	    		if (gAvoidTarget) {
				    switch(gDirection) {
				        case DirectionEnum.NORTH:
				        	gTargetConfirmed =  (y !== gHeight-1);
				        	break;
				        case DirectionEnum.EAST:
				        	gTargetConfirmed =  (x !== gWidth-1);
				        	break;
				        case DirectionEnum.SOUTH:
				        	gTargetConfirmed =  (y !== 0);
				        	break;
				        case DirectionEnum.WEST:
				        	gTargetConfirmed =  (x !== 0);
				        	break;
				    }	    			
	    		} else {
	    			gTargetConfirmed = true;
	    		}
	    	}
	    }
	    return true;
	} else {
		return false;
	}
};

var fireCannon = function() {
	gHoldLonger += MAX_HOLDING_INCREASE;
    api.fireCannon();
    throw {isAction: true, action: "Fire !!!"};
};

var moveForward = function() {
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
    throw {isAction: true, action: "Going Forward!", moved: true};
};

var moveBackward = function() {
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
    throw {isAction: true, action: "Going Backward!", moved: true};
};

var turnLeft = function() {
    gDirection = (gDirection+3)%4;
    api.turnLeft();
    throw {isAction: true, action: "Turning Left!", moved: false};
};

var turnRight = function() {
    gDirection = (gDirection+1)%4;
    api.turnRight();
    throw {isAction: true, action: "Turning Right!", moved: false};
};

//---------------------------------------------------------------------------
// Map Utility functions
//---------------------------------------------------------------------------

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

    // init the first visible tiles on map
    setTile(gX,0,TileEnum.OBJECT);
    for (var i=1; i<gLidar[DirectionEnum.NORTH]+gLidar[DirectionEnum.SOUTH]; i++) {
    	setTile(gX,i,TileEnum.EMPTY);
    	gMap[gX][i].vChecked = true;
    }
    setTile(gX,gLidar[DirectionEnum.NORTH]+gLidar[DirectionEnum.SOUTH],TileEnum.OBJECT);
    setTile(0,gY,TileEnum.OBJECT);
    for (var j=1; j<gLidar[DirectionEnum.EAST]+gLidar[DirectionEnum.WEST]; j++) {
        setTile(j,gY,TileEnum.EMPTY);
    	gMap[j][gY].hChecked = true;
    }
    setTile(gLidar[DirectionEnum.EAST]+gLidar[DirectionEnum.WEST],gY,TileEnum.OBJECT);
    
    // switching to next state
    gState = StateEnum.SEARCHING_POSITION;
    gFuel = api.currentFuel();
    gRound++;

    // print infos
    console.log("x: "+gX+", y: "+gY+" dir: "+gDirection);
    printMap();
    console.log("Starting fuel: "+gFuel);
    //console.log("State: "+gState);
};

var updateMap = function() {
    var toBeIncreased = false;
    var tX = 0, tY = 0;
    var uX = 0, uY = 0;

    // scanning in all direction
    getLidar();

    // check if border increased
    if (gY-gLidar[DirectionEnum.SOUTH]<0) {
        tY += gLidar[DirectionEnum.SOUTH] - gY;
        toBeIncreased = true;
        //console.log("SOUTH: new tY "+tY);
    }
    if (gX-gLidar[DirectionEnum.WEST]<0) {
        tX += gLidar[DirectionEnum.WEST] - gX;
        toBeIncreased = true;
        //console.log("WEST: new tX "+tX);
    }
    if (gY+gLidar[DirectionEnum.NORTH]+1>gHeight) {
        uY += gY+gLidar[DirectionEnum.NORTH]+1-gHeight;
        toBeIncreased = true;
        //console.log("NORTH: new uY "+uY);
    }
    if (gX+gLidar[DirectionEnum.EAST]+1>gWidth) {
        uX += gX+gLidar[DirectionEnum.EAST]+1-gWidth;
        toBeIncreased = true;
        //console.log("EAST: new uX "+uX);
    }
    if (toBeIncreased) {
    	gMap = increaseMap(tX, tY, gWidth+tX+uX, gHeight+tY+uY);
    }
    
    // updating column taking into account previous state
    if (gMap[gX][gY-gLidar[DirectionEnum.SOUTH]].value === TileEnum.EMPTY) {
    	gMap[gX][gY-gLidar[DirectionEnum.SOUTH]] = {reachable: true, value: TileEnum.ENEMY};
    } else if (gMap[gX][gY-gLidar[DirectionEnum.SOUTH]].value === TileEnum.OBJECT &&
    	gLidar[DirectionEnum.SOUTH] > 1) {
    	gMap[gX][gY-gLidar[DirectionEnum.SOUTH]] = {reachable: true, value: TileEnum.TARGET};
    } else if (gMap[gX][gY-gLidar[DirectionEnum.SOUTH]].value === TileEnum.UNKNOWN) {
    	gMap[gX][gY-gLidar[DirectionEnum.SOUTH]] = {reachable: true, value: TileEnum.OBJECT};
    } else {
        //console.log("Problem updating tiles... 1");
    }
    for (var i=gY-gLidar[DirectionEnum.SOUTH]+1; i<gY+gLidar[DirectionEnum.NORTH]; i++) {
        setTile(gX,i,TileEnum.EMPTY);
    	gMap[gX][i].vChecked = true;
    }
    if (gMap[gX][gY+gLidar[DirectionEnum.NORTH]].value === TileEnum.EMPTY) {
    	gMap[gX][gY+gLidar[DirectionEnum.NORTH]] = {reachable: true, value: TileEnum.ENEMY};
    } else if (gMap[gX][gY+gLidar[DirectionEnum.NORTH]].value === TileEnum.OBJECT &&
    	gLidar[DirectionEnum.NORTH] > 1) {
    	gMap[gX][gY+gLidar[DirectionEnum.NORTH]] = {reachable: true, value: TileEnum.TARGET};
    } else if (gMap[gX][gY+gLidar[DirectionEnum.NORTH]].value === TileEnum.UNKNOWN) {
    	gMap[gX][gY+gLidar[DirectionEnum.NORTH]] = {reachable: true, value: TileEnum.OBJECT};
    } else {
        //console.log("Problem updating tiles... 2");
    }

    // updating line taking into account previous state
    if (gMap[gX-gLidar[DirectionEnum.WEST]][gY].value === TileEnum.EMPTY) {
    	gMap[gX-gLidar[DirectionEnum.WEST]][gY] = {reachable: true, value: TileEnum.ENEMY};
    } else if (gMap[gX-gLidar[DirectionEnum.WEST]][gY].value === TileEnum.OBJECT && 
    	gLidar[DirectionEnum.WEST] > 1) {
    	gMap[gX-gLidar[DirectionEnum.WEST]][gY] = {reachable: true, value: TileEnum.TARGET};
    } else if (gMap[gX-gLidar[DirectionEnum.WEST]][gY].value === TileEnum.UNKNOWN) {
    	gMap[gX-gLidar[DirectionEnum.WEST]][gY] = {reachable: true, value: TileEnum.OBJECT};
    } else {
        //console.log("Problem updating tiles... 3");
    }
    for (var j=gX-gLidar[DirectionEnum.WEST]+1; j<gX+gLidar[DirectionEnum.EAST]; j++) {
        setTile(j,gY,TileEnum.EMPTY);
    	gMap[j][gY].hChecked = true;
    }
    if (gMap[gX+gLidar[DirectionEnum.EAST]][gY].value === TileEnum.EMPTY) {
    	gMap[gX+gLidar[DirectionEnum.EAST]][gY] = {reachable: true, value: TileEnum.ENEMY};
    } else if (gMap[gX+gLidar[DirectionEnum.EAST]][gY].value === TileEnum.OBJECT &&
    	gLidar[DirectionEnum.EAST] > 1) {
    	gMap[gX+gLidar[DirectionEnum.EAST]][gY] = {reachable: true, value: TileEnum.TARGET};
    } else if (gMap[gX+gLidar[DirectionEnum.EAST]][gY].value === TileEnum.UNKNOWN) {
    	gMap[gX+gLidar[DirectionEnum.EAST]][gY] = {reachable: true, value: TileEnum.OBJECT};
    } else {
        //console.log("Problem updating tiles... 4");
    }

    if (api.currentFuel() < (gFuel - FUEL_ATTACKED)) {
    	gAttacked = true;
    	console.log("Attacked!!!");
    } else {
    	gAttacked = false;
    }

    gFuel = api.currentFuel();
    gRound++;

    //console.log("x: "+gX+", y: "+gY+" dir: "+gDirection);
    printMap();
    console.log("Current fuel: "+gFuel);
    //console.log("State: "+gState);
};

var increaseMap = function(tX, tY, newWidth, newHeight) {
    var result = createMap(newWidth, newHeight);
    for(var i=0; i<gWidth; i++) {
        for (j=0; j<gHeight; j++) {
            result[i+tX][j+tY] = gMap[i][j];
        }
    }
    if (gPath) {
    	for (var i = 0; i < gPath.steps.length; i++) {
    		gPath.steps[i].x += tX;
    		gPath.steps[i].x += tY;
    	};
    }
    gWidth = newWidth;
    gHeight = newHeight;
    gX += tX;
    gY += tY;
    return result;
};

var printMap = function() {
    for(var i=0; i<gHeight; i++) {
        var s = "";
        for (j=0; j<gWidth; j++) {
        	if (gMap[j][gHeight-1-i].reachable) {
        		s+='.';
        	} else {
        		s+=' ';
        	}
        	if (gMap[j][gHeight-1-i].vChecked) {
        		s+='|';
        	} else {
        		s+=' ';
        	}
        	if ((j===gX) && ((gHeight-1-i)===gY)) {
	            s+='X';
        	} else if (gMap[j][gHeight-1-i].enemySpot) {
        		if (gMap[j][gHeight-1-i].value === TileEnum.ENEMY) {
	            	s+='E';
				} else {
	        		s+='S';					
				}
        	} else {
	            s+=gMap[j][gHeight-1-i].value;
        	}
        	if (gMap[j][gHeight-1-i].hChecked) {
        		s+='-';
        	} else {
        		s+=' ';
        	}
        }
        console.log(s);
    }
};

//---------------------------------------------------------------------------
// Main algorithmic functions
//---------------------------------------------------------------------------

var discoverPosition = function() {
	if (gRound > MAX_DISCOVERY_ROUNDS) {
		gPath = null;
		gState = StateEnum.TAKING_POSITION;
	} else {
		lookForEnemy();
	}
};

var takePosition = function() {
	if (gPath) {
		if (!gPath.isArrived) {
			performNextStep();
		} else {
			// TODO: should be done once only...
			var direction = computeOrientation();
			performOrientation(direction);
		}
		if (gRound > MAX_HOLDING_POSITION+gHoldLonger) {
			gPath = null;
			gState = StateEnum.SEARCHING_ENEMY;
		}
    	throw {isAction: true, action: "Waiting Enemy !!!"};
	} else {
		var gTile = computePositionTile();
	    console.log("Taking Position at:");
	    printTile(gTile);
		getPath(gTile.x, gTile.y, tileCandidates);
	    console.log("Position Path:");
	    printPath(gPath);
	}
};

var lookForEnemy = function() {
	if (gPath) {
		if (gPath.isArrived) {
			gPath = null;
		} else {
			performNextStep();
		}
	} else {
		getPath(gX, gY, exploreCandidates);
	    console.log("Next exploration path:");
	    printPath(gPath);
	    if (!gPath) {
	    	gState = StateEnum.SEARCHING_TARGET;
	    	gAvoidTarget = false;
	    }
	}
};

var lookForTarget = function() {
	if (gPath) {
		if (gPath.isArrived) {
			gPath = null;
		} else {
			performNextStep();
		}
	} else {
		getPath(gX, gY, targetCandidates);
	    console.log("Next target path:");
	    printPath(gPath);
	    if (!gPath) {
	    	throw "We missed something...";
	    }
	    gState = StateEnum.SEARCHING_ENEMY;
	    gAvoidTarget = true;
	}
};

var seekAndDestroy = function(type) {
	if (checkPresence(type)) {
	    switch(gDirection) {
	        case DirectionEnum.NORTH:
	        	console.log("seekAndDestroy NORTH");
	            if (gMap[gX+gLidar[DirectionEnum.EAST]][gY].value === type &&
	            	gX+gLidar[DirectionEnum.EAST] !== gWidth-1) {
	                turnRight();
	            } else {
	                turnLeft();
	            }
	            break;
	        case DirectionEnum.EAST:
	        	console.log("seekAndDestroy EAST");
	            if (gMap[gX][gY-gLidar[DirectionEnum.SOUTH]].value === type &&
	            	gY-gLidar[DirectionEnum.SOUTH] !== 0) {
	                turnRight();
	            } else {
	                turnLeft();
	            }
	            break;
	        case DirectionEnum.SOUTH:
	        	console.log("seekAndDestroy SOUTH");
	            if (gMap[gX-gLidar[DirectionEnum.WEST]][gY].value === type &&
	            	gX-gLidar[DirectionEnum.WEST] !== 0) {
	                turnRight();
	            } else {
	                turnLeft();
	            }
	            break;
	        case DirectionEnum.WEST:
	        	console.log("seekAndDestroy WEST");
	            if (gMap[gX][gY+gLidar[DirectionEnum.NORTH]].value === type &&
	            	gY+gLidar[DirectionEnum.NORTH] !== gHeight-1) {
	                turnRight();
	            } else {
	                turnLeft();
	            }
	            break;
	        default:
	        	console.log("seekAndDestroy Unknown direction: "+gDirection);
	    }		
	}
};

//---------------------------------------------------------------------------
// Misc Utility Functions
//---------------------------------------------------------------------------

var printTile = function(tile) {
	console.log(tile.x+","+tile.y);
};

var printPath = function(path) {
    for(var i=0; i<path.steps.length; i++) {
		console.log("Step "+i);
		printTile(path.steps[i]);        
    }
};

// TODO: unused...
var checkTile = function(x, y, type) {
	if (x<0 || x>=gWidth) {
		return false;
	}
	if (y<0 || y>=gHeight) {
		return false;
	}
	tile = gMap[x][y];
	return (tile.value === type);
};

var setTile = function(x, y, val) {
	gMap[x][y].value = val;
	if (val === TileEnum.EMPTY) {
		gMap[x-1][y].reachable = true;
		gMap[x+1][y].reachable = true;
		gMap[x][y-1].reachable = true;
		gMap[x][y+1].reachable = true;
	}
};

var isTilePossibleCandidate = function(x, y) {
	if (x<0 || x>=gWidth) {
		return false;
	}
	if (y<0 || y>=gHeight) {
		return false;
	}
	tile = gMap[x][y];
	return (tile.value === TileEnum.EMPTY) && (!tile.vChecked || !tile.hChecked);
}

var isTileCandidate = function(x, y) {
	for (var i=0; i<gCandidates.length; i++) {
		if ((gCandidates[i].x === x) && (gCandidates[i].y === y)) {
			return true;
		}
	}
	return false;
};

var checkPresence = function(type) {
	if (type !== TileEnum.ENEMY) {
		if (gMap[gX][gY+gLidar[DirectionEnum.NORTH]].value === type &&
			gY+gLidar[DirectionEnum.NORTH] !== gHeight-1) {
			console.log("1");
			return true;
		}
		if (gMap[gX][gY-gLidar[DirectionEnum.SOUTH]].value === type &&
			gY-gLidar[DirectionEnum.SOUTH] !== 0) {
			console.log("2");
			return true;
		}
		if (gMap[gX+gLidar[DirectionEnum.EAST]][gY].value === type &&
			gX+gLidar[DirectionEnum.EAST] !== gWidth-1) {
			console.log("3");
			return true;
		}
		if (gMap[gX-gLidar[DirectionEnum.WEST]][gY].value === type &&
			gX-gLidar[DirectionEnum.WEST] !== 0) {
			console.log("4");
			return true;
		}
		return false;
	} else {
		if (gMap[gX][gY+gLidar[DirectionEnum.NORTH]].value === type) {
			console.log("5");
			return true;
		}
		if (gMap[gX][gY-gLidar[DirectionEnum.SOUTH]].value === type) {
			console.log("6");
			return true;
		}
		if (gMap[gX+gLidar[DirectionEnum.EAST]][gY].value === type) {
			console.log("7");
			return true;
		}
		if (gMap[gX-gLidar[DirectionEnum.WEST]][gY].value === type) {
			console.log("8");
			return true;
		}
		return false;		
	}
};

//---------------------------------------------------------------------------
// Search Path Algorithms
//---------------------------------------------------------------------------

// TODO: if score is equal, the longest branch can also be used!
var computePositionTile = function() {
	var tile = {x:gX, y:gY};
	var maxScore = 0;
	var minDistance = gWidth*gWidth+gHeight*gHeight;
    for(var i=0; i<gWidth; i++) {
        for (j=0; j<gHeight; j++) {
        	if (gMap[i][j].value === TileEnum.EMPTY) {
	        	var score = computeScore(i, j);
	        	if (score > maxScore ) {
	        		maxScore = score;
	        		tile = {x: i, y: j};
	        	} 
	        	if (score === maxScore) {
	        		// TODO: could be optimized by calculating the real path with getPath...
	        		distance = (gX-i)*(gX-i)+(gY-j)*(gY-j);
	        		if (distance < minDistance) {
	        			minDistance = distance;
	        			tile = {x: i, y:j};
	        		}
	        	}
        	}
        }
    }
    return tile;
};

var computeScore = function(x, y) {
	var result = 0;
	var hasWall = false;
	var i=1;
	while(gMap[x+i][y].value === TileEnum.EMPTY) {
		i++;
	}
	result += i*i;
	if (i===1) {
		hasWall = true;
	}
	i=1;
	while(gMap[x-i][y].value === TileEnum.EMPTY) {
		i++;
	}
	result += i*i;
	if (i===1) {
		hasWall = true;
	}
	i=1;
	while(gMap[x][y+i].value === TileEnum.EMPTY) {
		i++;
	}
	result += i*i;
	if (i===1) {
		hasWall = true;
	}
	i=1;
	while(gMap[x][y-i].value === TileEnum.EMPTY) {
		i++;
	}
	result += i*i;
	if (i===1) {
		hasWall = true;
	}
	if (hasWall) {
		return result;
	}
	return 0;
};

var computeOrientation = function() {
	// we will face the direction where we can find the most UNKNOWN tile
	var result = undefined;
	var maxUnknown = 0;
	var count = 0;
	// NORTH
	for (var i = 0; i < gWidth; i++) {
		for (var j = gY+1; j < gHeight; j++) {
			if (gMap[i][j].value === TileEnum.UNKNOWN) {
				count++;
			}
		}
	}
	if (count > maxUnknown) {
		result = DirectionEnum.NORTH;
		maxUnknown = count;
		count = 0;
	}
	// EAST
	for (var i = gX+1; i < gWidth; i++) {
		for (var j = 0; j < gHeight; j++) {
			if (gMap[i][j].value === TileEnum.UNKNOWN) {
				count++;
			}
		}
	}
	if (count > maxUnknown) {
		result = DirectionEnum.EAST;
		maxUnknown = count;
		count = 0;
	}
	// SOUTH
	for (var i = 0; i < gWidth; i++) {
		for (var j = 0; j < gY; j++) {
			if (gMap[i][j].value === TileEnum.UNKNOWN) {
				count++;
			}
		}
	}
	if (count > maxUnknown) {
		result = DirectionEnum.SOUTH;
		maxUnknown = count;
		count = 0;
	}
	// WEST
	for (var i = 0; i < gX; i++) {
		for (var j = 0; j < gHeight; j++) {
			if (gMap[i][j].value === TileEnum.UNKNOWN) {
				count++;
			}
		}
	}
	if (count > maxUnknown) {
		result = DirectionEnum.WEST;
		maxUnknown = count;
		count = 0;
	}
	return result;
}

var initSearch = function() {
    for(var i=0; i<gWidth; i++) {
        for (j=0; j<gHeight; j++) {
        	delete gMap[i][j].searched;
        	delete gMap[i][j].fuelUsed;
        	delete gMap[i][j].steps;
        }
    }
	gPath = {found: false, fuelUsed: 0, step: 0, steps: []};
	gCandidates = [];
};

var getPath = function(x, y, candidateFunction) {
	initSearch();
	candidateFunction(x, y);
	if (isTileCandidate(gX, gY)) {
		gPath = {isArrived: true, found: true, fuelUsed: 0, step: 0, steps: []};
	}
	searchMapForward(gX, gY, gDirection, 0, []);
	searchMapLeft(gX,gY, gDirection, 0, []);
	searchMapRight(gX,gY, gDirection, 0, []);
	searchMapBackward(gX,gY, gDirection, 0, []);
};

var tileCandidates = function(x, y) {
	gCandidates.push({x:x,y:y});
};

var exploreCandidates = function(x, y) {
	var distance = 1;
	var maxDistance = computeMaxDistance(x,y);
	while (distance<=maxDistance) {
		checkTilesAtDistance(distance);
		distance++;
	}
};

var computeMaxDistance = function(x,y) {
	return Math.max(
		x+y,
		x+gHeight-y-1,
		y+gWidth-x-1,
		gWidth-x-1+gHeight-y-1
	);
};

var checkTilesAtDistance = function(distance) {
	for (var i = 0; i <= distance; i++) {
    	if (isTilePossibleCandidate(gX-i,gY+distance-i)) {
    		gCandidates.push({x:gX-i, y:gY+distance-i});
    	}
    	if (isTilePossibleCandidate(gX+i,gY+distance-i)) {
    		gCandidates.push({x:gX+i, y:gY+distance-i});
    	}
    	if (isTilePossibleCandidate(gX-i,gY-distance+i)) {
    		gCandidates.push({x:gX-i, y:gY-distance+i});
    	}
    	if (isTilePossibleCandidate(gX+i,gY-distance+i)) {
    		gCandidates.push({x:gX+i, y:gY-distance+i});
    	}
	}
};

var targetCandidates = function(x,y) {
	throw "targetCandidates missing...";
}

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
	fuel += FUEL_MOVE;
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
	fuel += FUEL_TURN+FUEL_MOVE;
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
	fuel += FUEL_MOVE;
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
	fuel += FUEL_TURN+FUEL_MOVE;
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
		if (isTileCandidate(x, y)) {
			if (gPath.found) {
				if (gPath.fuelUsed > fuel) {
					gPath.fuelUsed = fuel;
					gPath.steps = path.slice();
				}				
			} else {
				gPath.found = true;
				gPath.fuelUsed = fuel;
				gPath.steps = path.slice();
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
		if (isTileCandidate(x, y)) {
			if (gPath.found) {
				if (gPath.fuelUsed > fuel) {
					gPath.fuelUsed = fuel;
					gPath.steps = path.slice();
				}				
			} else {
				gPath.found = true;
				gPath.fuelUsed = fuel;
				gPath.steps = path.slice();
			}
			return;
		}
	}
	searchMapForward(x, y, direction, fuel, path.slice());
	searchMapLeft(x, y, direction, fuel, path.slice());
	searchMapRight(x, y, direction, fuel, path.slice());
	searchMapBackward(x, y, direction, fuel, path.slice());	
};

//---------------------------------------------------------------------------
// Moving Functions
//---------------------------------------------------------------------------

var performNextStep = function() {
	if (gPath.steps.length === 0) {
		gPath.isArrived = true;
		return;
	}
	var tile = gPath.steps[gPath.step];
	console.log("Performing step "+gPath.step+": ("+tile.x+","+tile.y+")");
	try {
		performMoveTo(tile);
	} catch(e) {
		if (e.moved) {
			gPath.step++;
			if (gPath.step === gPath.steps.length) {
				gPath.isArrived = true;
			}
		}
		throw e;
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
		console.log("Problem in move...");
	}

	switch(gDirection) {
		case DirectionEnum.NORTH:
			switch(goingTo) {
				case DirectionEnum.NORTH:
					moveForward();
				case DirectionEnum.SOUTH:
					moveBackward();
				case DirectionEnum.EAST:
					turnRight();
				case DirectionEnum.WEST:
					turnLeft();
			}
		case DirectionEnum.SOUTH:
			switch(goingTo) {
				case DirectionEnum.NORTH:
					moveBackward();
				case DirectionEnum.SOUTH:
					moveForward();
				case DirectionEnum.EAST:
					turnLeft();
				case DirectionEnum.WEST:
					turnRight();
			}
		case DirectionEnum.EAST:
			switch(goingTo) {
				case DirectionEnum.NORTH:
					turnLeft();
				case DirectionEnum.SOUTH:
					turnRight();
				case DirectionEnum.EAST:
					moveForward();
				case DirectionEnum.WEST:
					moveBackward();
			}
		case DirectionEnum.WEST:
			switch(goingTo) {
				case DirectionEnum.NORTH:
					turnRight();
				case DirectionEnum.SOUTH:
					turnLeft();
				case DirectionEnum.EAST:
					moveBackward();
				case DirectionEnum.WEST:
					moveForward();
			}
	}
};

var performOrientation = function(direction) {
	switch(gDirection) {
		case DirectionEnum.NORTH:
			switch(direction) {
				case DirectionEnum.SOUTH:
					turnLeft();
				case DirectionEnum.EAST:
					turnRight();
				case DirectionEnum.WEST:
					turnLeft();
			}
			break;
		case DirectionEnum.SOUTH:
			switch(direction) {
				case DirectionEnum.NORTH:
					turnLeft();
				case DirectionEnum.EAST:
					turnLeft();
				case DirectionEnum.WEST:
					turnRight();
			}
			break;
		case DirectionEnum.EAST:
			switch(direction) {
				case DirectionEnum.NORTH:
					turnLeft();
				case DirectionEnum.SOUTH:
					turnRight();
				case DirectionEnum.WEST:
					turnLeft();
			}
			break;
		case DirectionEnum.WEST:
			switch(direction) {
				case DirectionEnum.NORTH:
					turnRight();
				case DirectionEnum.SOUTH:
					turnLeft();
				case DirectionEnum.EAST:
					turnLeft();
			}
			break;
		}
};
