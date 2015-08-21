var api = require('./API.js');

/**
 * Executes a single step of the tank's programming. The tank can only move,
 * turn, or fire its cannon once per turn. Between each update, the tank's
 * engine remains running and consumes 1 fuel. This function will be called
 * repeatedly until there are no more targets left on the grid, or the tank runs
 * out of fuel.
 */

//---------------------------------------------------------------------------
// Constant and Global Definition
//---------------------------------------------------------------------------

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
    WALL: 4,
    TARGET: 8,
    ENEMY: 16
};

var StateEnum = {
    INIT: 0,
    SEARCHING_POSITION: 1,
    TAKING_POSITION: 2,
    SEARCHING_ENEMY: 3,
    SEARCHING_TARGET: 4
};

var MAX_DISCOVERY_ROUNDS = 7;
var MAX_HOLDING_POSITION = MAX_DISCOVERY_ROUNDS + 13;
var MAX_HOLDING_INCREASE = 4;

var MIN_FIRE_DISTANCE = 3;

var FUEL_IDLE = 1;
var FUEL_MOVE = 1 + FUEL_IDLE;
var FUEL_TURN = 1 + FUEL_IDLE;
var FUEL_ATTACKED = 50;

var HPERIODIC = 1;
var VPERIODIC = 2;

var gDirection = DirectionEnum.NORTH;
var gMap = [];
var gWidth = 0;
var gHeight = 0;
var gX = 0;
var gY = 0;
var gLidar = [0, 0, 0, 0];
var gPath = null;

var gState = StateEnum.INIT;
var gFuel = 0;
var gRound = 1;

var gTargetTile;
var gTargetNextTile;

var gHoldLonger = 0;

var gTargetConfirmed = false;
var gAttacked = false;
var gAvoidBorder = false;
var gAvoidEnemy = true;

// TODO: take into account gAttacked !!
// TODO: when getting the path, we should take the cost of reorientation into account...

//---------------------------------------------------------------------------
// Main Update Function
//---------------------------------------------------------------------------
exports.update = function () {
    try {
        if ( gState === StateEnum.INIT ) {
            console.log("Battle begin!");
            console.log("======= Round: " + gRound + " =======");
            initMap();
        } else {
            console.log("======= Round: " + gRound+" =======");
            updateMap(true);
        }
        computeTargetTiles();
        if ( !identifyTarget() ) {
            gTargetTile.value = TileEnum.WALL;
        }
        console.log("x: " + gX + ", y: " + gY + " dir: " + gDirection);
        printMap();
        if ( gTargetConfirmed ) {
            fireCannon();
        }
        if ( gState === StateEnum.SEARCHING_POSITION ) {
            gAvoidBorder = true;
            while ( gState === StateEnum.SEARCHING_POSITION ) {
                console.log("Seek and Destroy Enemy!!!");
                seekAndDestroy(TileEnum.ENEMY);
                console.log("Seek and Destroy Object!!!");
                seekAndDestroy(TileEnum.OBJECT);
                console.log("Discovering Position");
                discoverPosition();
            }
        }
        if ( gState === StateEnum.TAKING_POSITION ) {
            gAvoidBorder = true;
            var limitRound = MAX_HOLDING_POSITION + gHoldLonger;
            console.log("Keeping position until round " + limitRound);
            while ( gState === StateEnum.TAKING_POSITION ) {
                console.log("Seek and Destroy Enemy!!!");
                seekAndDestroy(TileEnum.ENEMY);
                console.log("Seek and Destroy Object!!!");
                seekAndDestroy(TileEnum.OBJECT);
                console.log("Taking Position");
                takePosition();
            }
        }
        if ( gState === StateEnum.SEARCHING_ENEMY ) {
            gAvoidBorder = true;
            gAvoidEnemy = true;
            while ( gState === StateEnum.SEARCHING_ENEMY ) {
                console.log("Seek and Destroy Enemy!!!");
                seekAndDestroy(TileEnum.ENEMY);
                console.log("Seek and Destroy Object!!!");
                seekAndDestroy(TileEnum.OBJECT);
                console.log("Seek and Destroy Target!!!");
                seekAndDestroy(TileEnum.TARGET);
                console.log("Searching Enemy");
                lookForEnemy();
            }
        }
        if ( gState === StateEnum.SEARCHING_TARGET ) {
            gAvoidBorder = false;
            while ( gState === StateEnum.SEARCHING_TARGET ) {
                console.log("Seek and Destroy Target!!!");
                seekAndDestroy(TileEnum.TARGET);
                console.log("Searching Target");
                lookForTarget();
            }
        }
    } catch (e) {
        if (e.isAction) {
            console.log(e.action);
            updateMap(false);
            console.log("x: " + gX + ", y: " + gY + " dir: " + gDirection);
            printMap();
            gRound++;
            console.log("Ending turn...");
        } else {
            console.log("Shit happened...");
            throw e;
        }
    }
};

//---------------------------------------------------------------------------
// Wrappers to API functions
//---------------------------------------------------------------------------

var getLidar = function () {
    gLidar[gDirection] = api.lidarFront();
    gLidar[( gDirection + 1 ) % 4] = api.lidarRight();
    gLidar[( gDirection + 2 ) % 4] = api.lidarBack();
    gLidar[( gDirection + 3 ) % 4] = api.lidarLeft();
    console.log("Lidar: " + gLidar);
};

var identifyTarget = function () {
    // we confirmed a target if the enemy is on the next tile (both type 1&2)
    // and if we check a progressing enemy (type 2)
    gTargetConfirmed = false;
    if ( api.identifyTarget() ) {
        if ( gAvoidBorder && isTileOnBorder(gTargetTile) ) {
            // console.log("On border...");
            // printTile(gTargetTile);
            return true;
        }
        switch( gTargetTile.value ) {
        case TileEnum.ENEMY:
            if ( gState === StateEnum.TAKING_POSITION ) {
                gTargetConfirmed = true;
            }
            // for safety reason... might be too late...
            if ( gLidar[gDirection] <= MIN_FIRE_DISTANCE ) {
                gTargetConfirmed = true;
            }
            // if a tile has been checked in both direction, we can safely fire!
            // TODO is obsolete because of the next test! 
            if ( gTargetTile.vChecked && gTargetTile.hChecked) {
                console.log("Let's rock your ASS!! :)");
                gTargetConfirmed = true;
            }
            // we can override the previous result if we are on a periodic enemy tile!
            if ( gTargetTile.periodicEnemy ) {
                if ( gDirection === DirectionEnum.NORTH || gDirection === DirectionEnum.SOUTH ) {
                    if ( gTargetTile.periodicEnemy & HPERIODIC ) {
                        gTargetConfirmed = false;
                    } else {
                        gTargetConfirmed = true;
                    }
                }
                if ( gDirection === DirectionEnum.EAST || gDirection === DirectionEnum.WEST ) {
                    if ( gTargetTile.periodicEnemy & VPERIODIC ) {
                        gTargetConfirmed = false;
                    } else {
                        gTargetConfirmed = true;
                    }
                }
            }
            // check if the enemy got closer
            if ( gTargetNextTile &&
                ( gTargetNextTile.value === TileEnum.ENEMY || gTargetNextTile.value === TileEnum.OBJECT ) ) {
                gTargetConfirmed = true;
            }
            if ( gPath && gPath.waitFor && gTargetTile === gPath.steps[gPath.step] ) {
                gTargetConfirmed = true;
                console.log("Spotted enemy has been eliminated!!!");
                gPath.waitFor = 1;
            }
            break;
        case TileEnum.OBJECT:
            // to be sure there is no enemy before to kill
            console.log("From identifyTarget: Seek and Destroy Enemy!!!");
            seekAndDestroy(TileEnum.ENEMY);
            gTargetConfirmed = true;
            break;
        case TileEnum.WALL|TileEnum.TARGET:
            gTargetTile.value = TileEnum.TARGET;
            // we don't break since we want to check the following case after update
        case TileEnum.TARGET:
            // to be sure there is no enemy before to kill
            console.log("From identifyTarget: Seek and Destroy Enemy!!!");
            seekAndDestroy(TileEnum.ENEMY);
            gTargetConfirmed = true;
            break;
        default:
            throw "Error in identifyTarget: " + gTargetTile.value;
        }
        return true;
    }
    return false;
};

var fireCannon = function () {
    gHoldLonger += MAX_HOLDING_INCREASE;
    api.fireCannon();
    throw {isAction: true, action: "!!!!!!!!!!!!!!!!!!!!! FIRE !!!!!!!!!!!!!!!!!!!!!"};
};

var moveForward = function () {
    switch (gDirection) {
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

var moveBackward = function () {
    switch (gDirection) {
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
    gDirection = (gDirection + 3) % 4;
    api.turnLeft();
    throw {isAction: true, action: "Turning Left!", moved: false};
};

var turnRight = function() {
    gDirection = (gDirection + 1) % 4;
    api.turnRight();
    throw {isAction: true, action: "Turning Right!", moved: false};
};

//---------------------------------------------------------------------------
// Map Utility functions
//---------------------------------------------------------------------------

var createMap = function(width, height) {
    var result = new Array(width);
    for (var i = 0; i < width; i++) {
        var col = new Array(height);
        for (var j = 0; j < height; j++) {
            col[j] = { x: i, y: j, value: TileEnum.UNKNOWN };
        }
        result[i] = col;
    }
    return result;
};

var initMap = function() {
    // scanning in all direction
    getLidar();
    // create the initial map
    gWidth = gLidar[DirectionEnum.EAST] + gLidar[DirectionEnum.WEST] + 1;
    gHeight = gLidar[DirectionEnum.NORTH] + gLidar[DirectionEnum.SOUTH] + 1;
    gMap = createMap(gWidth, gHeight);
    // init our coordinates
    gX = gLidar[DirectionEnum.WEST];
    gY = gLidar[DirectionEnum.SOUTH];

    // init the first visible tiles on map
    gMap[gX][0].value = TileEnum.OBJECT;
    gMap[gX][0].vChecked = true;
    for (var i = 1; i < gLidar[DirectionEnum.NORTH] + gLidar[DirectionEnum.SOUTH]; i++) {
        setEmptyTile(gMap[gX][i]);
        gMap[gX][i].vChecked = true;
    }
    gMap[gX][gLidar[DirectionEnum.NORTH] + gLidar[DirectionEnum.SOUTH]].value = TileEnum.OBJECT;
    gMap[gX][gLidar[DirectionEnum.NORTH] + gLidar[DirectionEnum.SOUTH]].vChecked = true;

    gMap[0][gY].value = TileEnum.OBJECT;
    gMap[0][gY].hChecked = true;
    for (var j = 1; j < gLidar[DirectionEnum.EAST] + gLidar[DirectionEnum.WEST]; j++) {
        setEmptyTile(gMap[j][gY]);
        gMap[j][gY].hChecked = true;
    }
    gMap[gLidar[DirectionEnum.EAST] + gLidar[DirectionEnum.WEST]][gY].value = TileEnum.OBJECT;
    gMap[gLidar[DirectionEnum.EAST] + gLidar[DirectionEnum.WEST]][gY].hChecked = true;
    
    // switching to next state
    gState = StateEnum.SEARCHING_POSITION;
    gFuel = api.currentFuel();
    gRound++;

    // print infos
    console.log("Starting fuel: " + gFuel);
};

var updateMap = function (turnBegin) {
    refreshMap();

    // updating column taking into account previous state
    var yMin = gY - gLidar[DirectionEnum.SOUTH];
    var yMax = gY + gLidar[DirectionEnum.NORTH];

    setLidarTile(gX, yMin, turnBegin);
    if ( turnBegin ) {
        gMap[gX][yMin].vChecked = true;
        gMap[gX][yMin].periodicEnemy &= HPERIODIC;
    }
    if (gMap[gX][yMin].vChecked && gMap[gX][yMin].hChecked) {
        delete gMap[gX][yMin].periodicEnemy;
    }
    for (var i = yMin + 1; i < yMax; i++) {
        setEmptyTile(gMap[gX][i]);
        gMap[gX][i].vChecked = true;
        gMap[gX][i].periodicEnemy &= HPERIODIC;
        if (gMap[gX][i].vChecked && gMap[gX][i].hChecked) {
            delete gMap[gX][i].periodicEnemy;
        }
    }
    setLidarTile(gX, yMax, turnBegin);
    if ( turnBegin ) {
        gMap[gX][yMax].vChecked = true;
        gMap[gX][yMax].periodicEnemy &= HPERIODIC;
    }
    if (gMap[gX][yMax].vChecked && gMap[gX][yMax].hChecked) {
        delete gMap[gX][yMax].periodicEnemy;
    }

    // updating line taking into account previous state
    var xMin = gX - gLidar[DirectionEnum.WEST];
    var xMax = gX + gLidar[DirectionEnum.EAST];

    setLidarTile(xMin, gY, turnBegin);
    if (turnBegin){
        gMap[xMin][gY].hChecked = true;
        gMap[xMin][gY].periodicEnemy &= VPERIODIC;
    }
    if (gMap[xMin][gY].vChecked && gMap[xMin][gY].hChecked) {
        delete gMap[xMin][gY].periodicEnemy;
    }
    for (var j= xMin + 1; j < xMax; j++) {
        setEmptyTile(gMap[j][gY]);
        gMap[j][gY].hChecked = true;
        gMap[j][gY].periodicEnemy &= VPERIODIC;
        if (gMap[j][gY].vChecked && gMap[j][gY].hChecked) {
            delete gMap[j][gY].periodicEnemy;
        }
    }
    setLidarTile(xMax, gY, turnBegin);
    if (turnBegin){
        gMap[xMax][gY].hChecked = true;
        gMap[xMax][gY].periodicEnemy &= VPERIODIC;
    }
    if (gMap[xMax][gY].vChecked && gMap[xMax][gY].hChecked) {
        delete gMap[xMax][gY].periodicEnemy;
    }

    if (api.currentFuel() < (gFuel - FUEL_ATTACKED)) {
        gAttacked = true;
        console.log("!!! Attacked !!!");
    } else {
        gAttacked = false;
    }

    gFuel = api.currentFuel();
    console.log("Current fuel: " + gFuel);
};

var refreshMap = function() {
    var toBeIncreased = false;
    var tX = 0, tY = 0;
    var uX = 0, uY = 0;

    // scanning in all direction
    getLidar();

    // check if border increased
    if (gY - gLidar[DirectionEnum.SOUTH] < 0) {
        tY += gLidar[DirectionEnum.SOUTH] - gY;
        toBeIncreased = true;
        console.log("SOUTH: new tY " + tY);
    }
    if (gX - gLidar[DirectionEnum.WEST] < 0) {
        tX += gLidar[DirectionEnum.WEST] - gX;
        toBeIncreased = true;
        console.log("WEST: new tX " + tX);
    }
    if (gY + gLidar[DirectionEnum.NORTH] + 1 > gHeight) {
        uY += gY + gLidar[DirectionEnum.NORTH] + 1 - gHeight;
        toBeIncreased = true;
        console.log("NORTH: new uY " + uY);
    }
    if (gX + gLidar[DirectionEnum.EAST] + 1 > gWidth) {
        uX += gX + gLidar[DirectionEnum.EAST] + 1 - gWidth;
        toBeIncreased = true;
        console.log("EAST: new uX " + uX);
    }
    if (toBeIncreased) {
        gMap = increaseMap(tX, tY, gWidth + tX + uX, gHeight + tY + uY);
    }
};

var increaseMap = function(tX, tY, newWidth, newHeight) {
    var result = createMap(newWidth, newHeight);

    for (var i = 0; i < gWidth; i++) {
        for (var j = 0; j < gHeight; j++) {
            result[i + tX][j + tY] = gMap[i][j];
            result[i + tX][j + tY].x = i + tX;
            result[i + tX][j + tY].y = j + tY;
        }
    }

    gWidth = newWidth;
    gHeight = newHeight;
    gX += tX;
    gY += tY;
    return result;
};

var printMap = function() {
    var i,j;
    for (i = 0; i < gHeight; i++) {
        var s = "";
        for (j = 0; j < gWidth; j++) {
            if (gMap[j][gHeight - 1 - i].vChecked) {
                s += '|';
            } else {
                s += ' ';
            }
            if ((j === gX) && ((gHeight - 1 - i) === gY)) {
                s += 'X';
            } else if (gMap[j][gHeight - 1 - i].periodicEnemy) {
                if ( gMap[j][gHeight - 1 - i].periodicEnemy === HPERIODIC ) {
                    s += 'H';
                } else if ( gMap[j][gHeight - 1 - i].periodicEnemy === VPERIODIC ) {
                    s += 'V';
                } else if ( gMap[j][gHeight - 1 - i].periodicEnemy === VPERIODIC|HPERIODIC ) {
                    s += '#';
                } else {
                    throw "Unknown periodicEnemy value...";
                }
            } else {
                switch(gMap[j][gHeight - 1 - i].value) {
                    case TileEnum.UNKNOWN:
                        s += '.';
                        break;
                    case TileEnum.EMPTY:
                        s += '0';
                        break;
                    case TileEnum.OBJECT:
                        s += 'B';
                        break;
                    case TileEnum.ENEMY:
                        s += 'E';
                        break;
                    case TileEnum.WALL:
                        s += 'W';
                        break;
                    case TileEnum.TARGET:
                        s += 'T';
                        break;
                    case TileEnum.WALL|TileEnum.TARGET:
                        s += '?';
                        break;
                    default:
                        s += gMap[j][gHeight - 1 - i].value;
                }
            }
            if (gMap[j][gHeight - 1 - i].hChecked) {
                s += '-';
            } else {
                s += ' ';
            }
        }
        console.log(s);
    }
};

//---------------------------------------------------------------------------
// Misc Utility Functions
//---------------------------------------------------------------------------

var printTile = function (tile) {
    console.log(tile.x + "," + tile.y);
};

var printPath = function(path) {
    for ( var i = 0; i < path.steps.length; i++ ) {
        console.log("Step " + i);
        printTile(path.steps[i]);        
    }
};

var setEmptyTile = function (tile) {
    switch ( tile.value ) {
        case TileEnum.UNKNOWN:
        case TileEnum.OBJECT:
        case TileEnum.WALL|TileEnum.TARGET:
            // if a neighbour is next to it, it is a potential threat, 
            if (gMap[tile.x][tile.y + 1].periodicEnemy & VPERIODIC ||
                gMap[tile.x][tile.y - 1].periodicEnemy & VPERIODIC ) {
                console.log("Tile has been infected... :)");
                printTile(tile);
                tile.periodicEnemy |= VPERIODIC;
                propagateVDetection(tile);
            }
            if (gMap[tile.x + 1][tile.y].periodicEnemy & HPERIODIC ||
                gMap[tile.x - 1][tile.y].periodicEnemy & HPERIODIC ) {
                console.log("Tile has been infected... :)");
                printTile(tile);
                tile.periodicEnemy |= HPERIODIC;
                propagateHDetection(tile);
            }
            // if surrounded by wall, we can check this direction
            if (gMap[tile.x][tile.y + 1].value&TileEnum.WALL &&
                gMap[tile.x][tile.y - 1].value&TileEnum.WALL) {
                tile.vChecked = true;
                tile.periodicEnemy &= HPERIODIC;
                console.log("Tile is walled!!! :)");
                printTile(tile);
            }
            if (gMap[tile.x + 1][tile.y].value&TileEnum.WALL &&
                gMap[tile.x - 1][tile.y].value&TileEnum.WALL) {
                tile.hChecked = true;
                tile.periodicEnemy &= VPERIODIC;
                console.log("Tile is walled!!! :)");
                printTile(tile);
            }
            break;
        case TileEnum.EMPTY:
            // if surrounded by wall, we can check this direction
            if (gMap[tile.x][tile.y + 1].value&TileEnum.WALL &&
                gMap[tile.x][tile.y - 1].value&TileEnum.WALL) {
                tile.vChecked = true;
                tile.periodicEnemy &= HPERIODIC;
                console.log("Tile is walled!!! :)");
                printTile(tile);
            }
            if (gMap[tile.x + 1][tile.y].value&TileEnum.WALL &&
                gMap[tile.x - 1][tile.y].value&TileEnum.WALL) {
                tile.hChecked = true;
                tile.periodicEnemy &= VPERIODIC;
                console.log("Tile is walled!!! :)");
                printTile(tile);
            }
            break;
        case TileEnum.ENEMY:
            if ( !isTileInView(tile) && !tile.periodicEnemy) {
                console.log("!!!!!!! periodicEnemy spotted at: " + tile.x + "," + tile.y + " !!!!!!!");
                if (gX === tile.x) {
                    tile.periodicEnemy = tile.periodicEnemy | HPERIODIC;
                    tile.hChecked = false;
                } else {
                    tile.periodicEnemy = tile.periodicEnemy | VPERIODIC;
                    tile.vChecked = false;
                }
                propagateEnemyDetection(tile);
            } else {
                if ( !gTargetConfirmed && 
                     getNextTile(tile).value !== TileEnum.ENEMY &&
                     !tile.periodicEnemy ) {
                    console.log("!!!!!!! periodicEnemy spotted at: " + tile.x + "," + tile.y + " !!!!!!!");
                    if (gX === tile.x) {
                        tile.periodicEnemy = tile.periodicEnemy | HPERIODIC;
                        tile.hChecked = false;
                    } else {
                        tile.periodicEnemy = tile.periodicEnemy | VPERIODIC;
                        tile.vChecked = false;
                    }
                    propagateEnemyDetection(tile);
                }
            }
            break;
        case TileEnum.TARGET:
            break;
        default:
            throw "=================== Problem setting tile (" + tile.x + "," + tile.y + "): " + tile.value + " ===================";
    }
    tile.value = TileEnum.EMPTY;
};

var isTileInView = function (tile) {
    var result = false;
    switch(gDirection) {
        case DirectionEnum.NORTH:
            result = (gX === tile.x) && (gY < tile.y);
            break;
        case DirectionEnum.EAST:
            result = (gX < tile.x) && (gY === tile.y);
            break;
        case DirectionEnum.SOUTH:
            result = (gX === tile.x) && (gY > tile.y);
            break;
        case DirectionEnum.WEST:
            result = (gX > tile.x) && (gY === tile.y);
            break;
    }
    return result;
};

var getNextTile = function (tile) {
    switch(gDirection) {
        case DirectionEnum.NORTH:
            return gMap[tile.x][tile.y + 1];
        case DirectionEnum.EAST:
            return gMap[tile.x + 1][tile.y];
        case DirectionEnum.SOUTH:
            return gMap[tile.x][tile.y - 1];
        case DirectionEnum.WEST:
            return gMap[tile.x - 1][tile.y];
    }
};

var propagateEnemyDetection = function (fromTile) {
    var i;

    if ( gX === fromTile.x ) {
        i = 1;
        while ( fromTile.x + i < gWidth &&
                (gMap[fromTile.x + i][fromTile.y].value === TileEnum.EMPTY ||
                 gMap[fromTile.x + i][fromTile.y].value === TileEnum.ENEMY )) {
            gMap[fromTile.x + i][fromTile.y].periodicEnemy |= fromTile.periodicEnemy;
            gMap[fromTile.x + i][fromTile.y].hChecked = false;
            i++;
        }
        i = 1;
        while ( fromTile.x - i >= 0 &&
                (gMap[fromTile.x - i][fromTile.y].value === TileEnum.EMPTY ||
                 gMap[fromTile.x - i][fromTile.y].value === TileEnum.ENEMY )) {
            gMap[fromTile.x - i][fromTile.y].periodicEnemy |= fromTile.periodicEnemy;
            gMap[fromTile.x - i][fromTile.y].hChecked = false;
            i++;
        }
    }
    if ( gY === fromTile.y ) {
        i = 1;
        while ( fromTile.y + i < gHeight &&
                (gMap[fromTile.x][fromTile.y + i].value === TileEnum.EMPTY ||
                 gMap[fromTile.x][fromTile.y + i].value === TileEnum.ENEMY )) {
            gMap[fromTile.x][fromTile.y + i].periodicEnemy |= fromTile.periodicEnemy;
            gMap[fromTile.x][fromTile.y + i].vChecked = false;
            i++;
        }
        i = 1;
        while ( fromTile.y - i >= 0 &&
                (gMap[fromTile.x][fromTile.y - i].value === TileEnum.EMPTY ||
                 gMap[fromTile.x][fromTile.y - i].value === TileEnum.ENEMY )) {
            gMap[fromTile.x][fromTile.y - i].periodicEnemy |= fromTile.periodicEnemy;
            gMap[fromTile.x][fromTile.y - i].vChecked = false;
            i++;
        }
    }
};

var propagateHDetection = function (fromTile) {
    var i = 1;
    while ( fromTile.x + i < gWidth &&
            (gMap[fromTile.x + i][fromTile.y].value === TileEnum.EMPTY ||
             gMap[fromTile.x + i][fromTile.y].value === TileEnum.ENEMY )) {
        gMap[fromTile.x + i][fromTile.y].periodicEnemy |= HPERIODIC;
        i++;
    }
    i = 1;
    while ( fromTile.x - i >= 0 &&
            (gMap[fromTile.x - i][fromTile.y].value === TileEnum.EMPTY ||
             gMap[fromTile.x - i][fromTile.y].value === TileEnum.ENEMY )) {
        gMap[fromTile.x - i][fromTile.y].periodicEnemy |= HPERIODIC;
        i++;
    }
};

var propagateVDetection = function (fromTile) {
    var i = 1;
    while ( fromTile.y + i < gHeight &&
            (gMap[fromTile.x][fromTile.y + i].value === TileEnum.EMPTY ||
             gMap[fromTile.x][fromTile.y + i].value === TileEnum.ENEMY )) {
        gMap[fromTile.x][fromTile.y + i].periodicEnemy |= VPERIODIC;
        i++;
    }
    i = 1;
    while ( fromTile.y - i >= 0 &&
            (gMap[fromTile.x][fromTile.y - i].value === TileEnum.EMPTY ||
             gMap[fromTile.x][fromTile.y - i].value === TileEnum.ENEMY )) {
        gMap[fromTile.x][fromTile.y - i].periodicEnemy |= VPERIODIC;
        i++;
    }
};

var isTileOnBorder = function (tile) {
    return (tile.x === gWidth - 1) ||
            (tile.y === gHeight - 1) ||
            (tile.x === 0) ||
            (tile.y === 0);
};

var setLidarTile = function (x, y, turnBegin) {
    switch (gMap[x][y].value) {
        case TileEnum.UNKNOWN:
            if (turnBegin) {
                gMap[x][y].value = TileEnum.OBJECT;
            }
            break;
        case TileEnum.EMPTY:
            gMap[x][y].value = TileEnum.ENEMY;
            break;
        case TileEnum.OBJECT:
            if (turnBegin) {
                gMap[x][y].value = TileEnum.WALL|TileEnum.TARGET;
            }
            break;
        case TileEnum.WALL:
            break;
        case TileEnum.TARGET:
            break;
        case TileEnum.WALL|TileEnum.TARGET:
            break;
        case TileEnum.ENEMY:
            break;
        default:
            throw "=================== Problem updating lidar tile: " + gMap[x][y].value + " ===================";
    }
};

var computeTargetTiles = function() {
    switch(gDirection) {
        case DirectionEnum.NORTH:
            gTargetTile = gMap[gX][gY + gLidar[gDirection]];
            if (gY+gLidar[gDirection] + 1 < gHeight) {
                gTargetNextTile = gMap[gX][gY + gLidar[gDirection] + 1];
            } else {
                gTargetNextTile = undefined;
            }
            break;
        case DirectionEnum.EAST:
            gTargetTile = gMap[gX + gLidar[gDirection]][gY];
            if (gX + gLidar[gDirection] + 1 < gWidth) {
                gTargetNextTile = gMap[gX + gLidar[gDirection] + 1][gY];
            } else {
                gTargetNextTile = undefined;
            }
            break;
        case DirectionEnum.SOUTH:
            gTargetTile = gMap[gX][gY-gLidar[gDirection]];
            if (gY - gLidar[gDirection] - 1 >= 0) {
                gTargetNextTile = gMap[gX][gY - gLidar[gDirection] - 1];
            } else {
                gTargetNextTile = undefined;
            }
            break;
        case DirectionEnum.WEST:
            gTargetTile = gMap[gX - gLidar[gDirection]][gY];
            if (gX - gLidar[gDirection] - 1 >= 0) {
                gTargetNextTile = gMap[gX - gLidar[gDirection] - 1][gY];
            } else {
                gTargetNextTile = undefined;
            }
            break;
    }
};

var isTileInList = function(x, y, list) {
    for (var i = 0; i < list.length; i++) {
        if ((list[i].x === x) && (list[i].y === y)) {
            return true;
        }
    }
    return false;
};

var computeWaitEnemy = function (tile) {
    // the spot should no longer exist, let's go now! :)
    if ( tile.vChecked && tile.hChecked ) {
        delete tile.periodicEnemy;
        return 1;
    }
    // we initialize to 1, the spot itself!
    var count = 1;
    var maxCount = 1;
    var i = 1;
    if ( !tile.hChecked ) {
        while ( tile.x + i < gWidth - 1 &&
                !( gMap[tile.x + i][tile.y].value & TileEnum.WALL ||
                   gMap[tile.x + i][tile.y].value & TileEnum.TARGET )) {
            count++;
            i++;
        }
        maxCount = Math.max(maxCount, count);
        count = 1;
        i = 1;
        while ( tile.x - i > 0 &&
                !( gMap[tile.x - i][tile.y].value & TileEnum.WALL ||
                   gMap[tile.x - i][tile.y].value & TileEnum.TARGET )) {
            count++;
            i++;
        }
        maxCount = Math.max(maxCount, count);
        count = 1;
        i = 1;
    }
    if ( !tile.vChecked ) {
        while ( tile.y + i < gHeight - 1 &&
                !( gMap[tile.x][tile.y + i].value & TileEnum.WALL ||
                   gMap[tile.x][tile.y + i].value & TileEnum.TARGET )) {
            count++;
            i++;
        }
        maxCount = Math.max(maxCount, count);
        count = 1;
        i = 1;
        while ( tile.y - i > 0 &&
                !( gMap[tile.x][tile.y - i].value & TileEnum.WALL ||
                   gMap[tile.x][tile.y - i].value & TileEnum.TARGET )) {
            count++;
            i++;
        }
        maxCount = Math.max(maxCount, count);
        count = 1;
        i = 1;
    }
    // add 2 turn for an enemy to bounce eventually on a wall
    count = 2 * maxCount + 2;
    console.log("Waiting enemy for " + count + " turns!");
    return count;
};

//---------------------------------------------------------------------------
// Main algorithmic functions
//---------------------------------------------------------------------------

var discoverPosition = function () {
    if ( gRound > MAX_DISCOVERY_ROUNDS ) {
        gPath = null;
        gState = StateEnum.TAKING_POSITION;
    } else {
        exploreMap(true);
    }
};

var exploreMap = function (useDiscovery) {
    if ( gPath ) {
        if (gPath.isArrived) {
            console.log("Arrived...");
            gPath = null;
        } else {
            performNextStep();
        }
    } else {
        getPath(gX, gY, exploreCandidates, useDiscovery);
        console.log("Next exploration path:");
        printPath(gPath);
        if (!gPath.found) {
            console.log("None found...");
            console.log("Direct confrontation...");
            gAvoidEnemy = false;
            gPath = null;
        }
    }
};

var takePosition = function() {
    if (gPath) {
        if (gRound > MAX_HOLDING_POSITION+gHoldLonger) {
            gPath = null;
            gState = StateEnum.SEARCHING_ENEMY;
        } else {
            if (!gPath.isArrived) {
                performNextStep();
            } else {
                var orientation = computeOrientation();
                console.log("Orientating in direction: "+orientation);
                performOrientation(orientation);
                throw {isAction: true, action: "Waiting Enemy !!!"};
            }
        }
    } else {
        var gTile = computePositionTile();
        console.log("Taking Position at:");
        printTile(gTile);
        getPath(gTile.x, gTile.y, tileCandidates, false);
        console.log("Position Path:");
        printPath(gPath);
    }
};

var lookForEnemy = function() {
    if ( gPath ) {
        if ( gPath.isArrived ) {
            console.log("Arrived...");
            delete gPath.waitFor;
            gPath = null;            
        } else if ( gPath.waitFor ) {
            gPath.waitFor--;
            console.log("Waiting for " + gPath.waitFor + " more turns...");
            if ( gPath.waitFor <= 1 ) {
                performNextStep();
            }
            var orientation = computeSpotOrientation(gPath.steps[gPath.step]);
            console.log("Orientating in direction: "+orientation);
            performOrientation(orientation);
            throw {isAction: true, action: "Waiting Enemy !!!"};
        } else {
            var currentStep = gPath.steps[gPath.step];
            if ( gPath.step === gPath.steps.length - 1 && currentStep.periodicEnemy ) {
                console.log("Before an enemy tile!!!");
                gPath.waitFor = computeWaitEnemy(currentStep);
                //throw {isAction: true, action: "Waiting Enemy !!!"};
                return;
            }
            performNextStep();
        }
    } else {
        getPath(gX, gY, enemyCandidates, false);
        console.log("Next enemy path:");
        printPath(gPath);
        if (!gPath.found) {
            console.log("None found...");
            gPath = null;
            exploreMap(false);
        }
    }
};

var lookForTarget = function() {
    if (gPath) {
        if (gPath.isArrived) {
            console.log("Arrived...");
            gPath = null;
            gState = StateEnum.SEARCHING_ENEMY;
        } else {
            performNextStep();
        }
    } else {
        getPath(gX, gY, targetCandidates, false);
        console.log("Next target path:");
        printPath(gPath);
        if (!gPath.found) {
            console.log("None found...");
            gPath = null;
            gState = StateEnum.SEARCHING_ENEMY;
            throw "We still missed something! :)";
        }
    }
};

var seekAndDestroy = function (type) {
    var result = {found:false};
    var distance = Math.max(gWidth, gHeight);
    var isComingCloser = false;
    var tile;

    // NORTH
    tile = gMap[gX][gY + gLidar[DirectionEnum.NORTH]];
    if ( (tile.value & type) && !tile.periodicEnemy ) {
        //printTile(tile);
        if ( !isTileOnBorder(tile) || 
             gState === StateEnum.SEARCHING_TARGET ) 
        {
            if ( gY + gLidar[DirectionEnum.NORTH] + 1 < gHeight && 
                 gMap[gX][gY + gLidar[DirectionEnum.NORTH] + 1].value & type ) 
            {
                isComingCloser = true;
            } else 
            {
                isComingCloser = false;
            }
            result = {found: true, direction: DirectionEnum.NORTH};
            distance = gLidar[DirectionEnum.NORTH];
        }
    }
    // EAST
    tile = gMap[gX + gLidar[DirectionEnum.EAST]][gY];
    if ( (tile.value & type) && !tile.periodicEnemy ) {
        //printTile(tile);
        if ( !isTileOnBorder(tile) || 
             gState === StateEnum.SEARCHING_TARGET )
        {
            if ( (gLidar[DirectionEnum.EAST] < distance) ||
                 (gLidar[DirectionEnum.EAST] === distance && DirectionEnum.EAST === gDirection) ) 
            {
                if ( gX + gLidar[DirectionEnum.EAST] + 1 < gWidth && 
                     gMap[gX + gLidar[DirectionEnum.EAST] + 1][gY].value & type) 
                {
                    isComingCloser = true;
                } else 
                {
                    isComingCloser = false;
                }
                result = {found: true, direction: DirectionEnum.EAST};
                distance = gLidar[DirectionEnum.EAST];
            }
        }
    }
    // SOUTH
    tile = gMap[gX][gY - gLidar[DirectionEnum.SOUTH]];
    if ( (tile.value & type) && !tile.periodicEnemy ) {
        //printTile(tile);
        if ( !isTileOnBorder(tile) || 
             gState === StateEnum.SEARCHING_TARGET )
        {
            if ( gLidar[DirectionEnum.SOUTH] < distance ||
                 (gLidar[DirectionEnum.SOUTH] === distance && DirectionEnum.SOUTH === gDirection) )
            {
                if (gY - gLidar[DirectionEnum.SOUTH] - 1 >= 0 && 
                    gMap[gX][gY - gLidar[DirectionEnum.SOUTH] - 1].value & type) 
                {
                    isComingCloser = true;
                } else 
                {
                    isComingCloser = false;
                }
                result = {found: true, direction: DirectionEnum.SOUTH};
                distance = gLidar[DirectionEnum.SOUTH];
            }
        }
    }
    // WEST
    tile = gMap[gX - gLidar[DirectionEnum.WEST]][gY];
    if ( (tile.value & type) && !tile.periodicEnemy ) {
        //printTile(tile);
        if ( !isTileOnBorder(tile) || 
             gState === StateEnum.SEARCHING_TARGET)
        {
            if ( (gLidar[DirectionEnum.WEST] < distance) ||
                 (gLidar[DirectionEnum.WEST] === distance && DirectionEnum.WEST === gDirection) ) 
            {
                if (gX - gLidar[DirectionEnum.WEST] - 1 >= 0 && gMap[gX - gLidar[DirectionEnum.WEST] - 1][gY].value & type) 
                {
                    isComingCloser = true;
                } else 
                {
                    isComingCloser = false;
                }
                result = {found: true, direction: DirectionEnum.WEST};
                distance = gLidar[DirectionEnum.WEST];
            }
        }
    }
    
    if (result.found) {
        console.log("Type: " + type + " spotted in direction: " + result.direction + " at distance: " + distance);
        var roundToTurn = Math.abs(gDirection - result.direction);
        if (roundToTurn === 3) {
            // due to the fact that we can turn in both direction...
            roundToTurn = 1;
        }
        performOrientation(result.direction);
    }
};

//---------------------------------------------------------------------------
// Search Path Algorithms
//---------------------------------------------------------------------------

var computePositionTile = function () {
    var result;
    var maxScore = 0;
    var minDistance = gWidth * gWidth + gHeight * gHeight;
    for(var i = 0; i < gWidth; i++) {
        for (var j = 0; j < gHeight; j++) {
            if ( gMap[i][j].value === TileEnum.EMPTY ) {
                var score = computeScore(i, j);
                if ( score > maxScore ) {
                    maxScore = score;
                    result = gMap[i][j];
                } 
                if ( score === maxScore ) {
                    // TODO: could be optimized by calculating the real path with getPath...
                    distance = (gX - i) * (gX - i) + (gY - j) * (gY - j);
                    if (distance < minDistance) {
                        minDistance = distance;
                        result = gMap[i][j];
                    }
                }
            }
        }
    }
    return result;
};

var computeScore = function (x, y) {
    var result = 0;
    var hasWall = false;
    var i = 1;
    while ( gMap[x + i][y].value === TileEnum.EMPTY ) {
        i++;
    }
    result += i * i;
    if ( i === 1 ) {
        hasWall = true;
    }
    i = 1;
    while ( gMap[x - i][y].value === TileEnum.EMPTY ) {
        i++;
    }
    result += i * i;
    if ( i === 1 ) {
        hasWall = true;
    }
    i = 1;
    while ( gMap[x][y + i].value === TileEnum.EMPTY ) {
        i++;
    }
    result += i * i;
    if ( i === 1 ) {
        hasWall = true;
    }
    i = 1;
    while ( gMap[x][y - i].value === TileEnum.EMPTY ) {
        i++;
    }
    result += i * i;
    if ( i === 1 ) {
        hasWall = true;
    }
    if ( hasWall ) {
        return result;
    }
    return 0;
};

var computeOrientation = function () {
    // we will face the direction where we can find the most UNKNOWN tile
    var result;
    var maxUnknown = 0;
    var i, j;
    // NORTH
    var count = 0;
    for (i = 0; i < gWidth; i++) {
        for (j = gY + 1; j < gHeight; j++) {
            if ( gMap[i][j].value === TileEnum.UNKNOWN ) {
                count++;
            }
        }
    }
    //console.log("NORTH: "+count);
    if (count > maxUnknown) {
        result = DirectionEnum.NORTH;
        maxUnknown = count;
    }
    // EAST
    count = 0;
    for (i = gX + 1; i < gWidth; i++) {
        for (j = 0; j < gHeight; j++) {
            if ( gMap[i][j].value === TileEnum.UNKNOWN ) {
                count++;
            }
        }
    }
    //console.log("EAST: "+count);
    if (count > maxUnknown) {
        result = DirectionEnum.EAST;
        maxUnknown = count;
    }
    // SOUTH
    count = 0;
    for (i = 0; i < gWidth; i++) {
        for (j = 0; j < gY; j++) {
            if ( gMap[i][j].value === TileEnum.UNKNOWN ) {
                count++;
            }
        }
    }
    //console.log("SOUTH: "+count);
    if (count > maxUnknown) {
        result = DirectionEnum.SOUTH;
        maxUnknown = count;
    }
    // WEST
    count = 0;
    for (i = 0; i < gX; i++) {
        for (j = 0; j < gHeight; j++) {
            if ( gMap[i][j].value === TileEnum.UNKNOWN ) {
                count++;
            }
        }
    }
    //console.log("WEST: "+count);
    if (count > maxUnknown) {
        result = DirectionEnum.WEST;
        maxUnknown = count;
    }
    return result;
};

var computeSpotOrientation = function (tile) {
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
        throw "Problem in move...";
    }
    return goingTo;
};

var initSearch = function () {
    for(var i = 0; i < gWidth; i++) {
        for (var j = 0; j < gHeight; j++) {
            delete gMap[i][j].searched;
            delete gMap[i][j].fuel;
            delete gMap[i][j].isCandidate;
        }
    }
    gPath = {found: false, fuel: 0, discovery: 0, step: 0, steps: []};
};

var getPath = function (x, y, candidateFunction, useDiscovery) {
    initSearch();
    
    if ( candidateFunction(x, y) === 0 ) {
        console.log("No candidates found...");
        return;
    }
    if ( gMap[gX][gY].isCandidate ) {
        gPath.found = true;
        gPath.isArrived = true;
        return;
    }
    searchMapForward(gX, gY, gDirection, 0, [], useDiscovery);
    searchMapRight(gX, gY, gDirection, 0, [], useDiscovery);
    searchMapLeft(gX, gY, gDirection, 0, [], useDiscovery);
    searchMapBackward(gX, gY, gDirection, 0, [], useDiscovery);
};

var exploreCandidates = function(x, y) {
    var distance = 1;
    var maxDistance = computeMaxDistance(x,y);
    while (distance <= maxDistance) {
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
        if ( isTilePossibleCandidate(gX - i, gY + distance - i) ) {
            gMap[gX - i][gY + distance - i].isCandidate = true;
        }
        if ( isTilePossibleCandidate(gX + i, gY + distance - i) ) {
            gMap[gX + i][gY + distance - i].isCandidate = true;
        }
        if ( isTilePossibleCandidate(gX - i, gY - distance + i) ) {
            gMap[gX - i][gY - distance + i].isCandidate = true;
        }
        if ( isTilePossibleCandidate(gX + i, gY - distance + i) ) {
            gMap[gX + i][gY - distance + i].isCandidate = true;
        }
    }
};

var isTilePossibleCandidate = function(x, y) {
    if (x < 0 || x >= gWidth) {
        return false;
    }
    if (y < 0 || y >= gHeight) {
        return false;
    }
    tile = gMap[x][y];
    var result = (tile.value === TileEnum.EMPTY) && (!tile.vChecked || !tile.hChecked);
    if ( gAvoidEnemy ) {
        result = result && (!tile.periodicEnemy);
    }
    return result;
};

var tileCandidates = function (x, y) {
    gMap[x][y].isCandidate = true;
};

var enemyCandidates = function (x, y) {
    // if we discovered any periodic enemy, we have to attack them on the border 
    // to minimize the chance to be attacked once there
    for(var i = 0; i < gWidth; i++) {
        for (var j = 0; j < gHeight; j++) {
            var tile = gMap[i][j];
            if ( tile.periodicEnemy ) {
                var k;
                // To avoid false enemypath from propagateEnemyDetection application
                if ( !tile.vChecked && !tile.hChecked) {
                    //console.log("Avoiding Tile:");
                    //printTile(tile);
                    continue;
                }
                if ( !tile.vChecked ) {
                    k = 1;
                    while( (j + k < gHeight - 1) && (gMap[i][j + k].value === TileEnum.EMPTY) ) {
                        k++;
                    }
                    if ( gMap[i][j + k].value & TileEnum.WALL ||
                         gMap[i][j + k].value & TileEnum.OBJECT || 
                         j + k === gHeight - 1) {
                        gMap[i][j + k - 1].isCandidate = true;
                        gMap[i][j + k - 1].periodicEnemy |= tile.periodicEnemy;
                        printTile(gMap[i][j + k - 1]);
                    }
                    k = 1;
                    while( (j - k > 0) && (gMap[i][j - k].value === TileEnum.EMPTY) ) {
                        k++;
                    }
                    if ( gMap[i][j - k].value & TileEnum.WALL ||
                         gMap[i][j - k].value & TileEnum.OBJECT || 
                         j - k === 0) {
                        gMap[i][j - k + 1].isCandidate = true;
                        gMap[i][j - k + 1].periodicEnemy |= tile.periodicEnemy;
                        printTile(gMap[i][j - k + 1]);
                    }
                }
                if ( !tile.hChecked ) {
                    k = 1;
                    while( (i + k < gWidth - 1) && (gMap[i + k][j].value === TileEnum.EMPTY) ) {
                        k++;
                    }
                    if ( gMap[i + k][j].value & TileEnum.WALL ||
                         gMap[i + k][j].value & TileEnum.OBJECT ||
                         i + k === gWidth - 1) {
                        gMap[i + k - 1][j].isCandidate = true;
                        gMap[i + k - 1][j].periodicEnemy |= tile.periodicEnemy;
                        printTile(gMap[i + k - 1][j]);
                    }
                    k = 1;
                    while( (i - k > 0) && (gMap[i - k][j].value === TileEnum.EMPTY) ) {
                        k++;
                    }
                    if ( gMap[i - k][j].value & TileEnum.WALL ||
                         gMap[i - k][j].value & TileEnum.OBJECT ||
                         i - k === 0) {
                        gMap[i - k + 1][j].isCandidate = true;
                        gMap[i - k + 1][j].periodicEnemy |= tile.periodicEnemy;
                        printTile(gMap[i - k + 1][j]);
                    }
                }
            }
        }
    }
    //exploreCandidates(x, y);
};

var targetCandidates = function (x, y) {
    for(var i = 0; i < gWidth; i++) {
        for (var j = 0; j < gHeight; j++) {
            var tile = gMap[i][j];
            if ( tile.value & TileEnum.OBJECT || tile.value & TileEnum.TARGET ) {
                var k = 1;
                while( (j + k < gHeight) && (gMap[i][j + k].value === TileEnum.EMPTY) ) {
                    gMap[i][j + k].isCandidate = true;
                    k++;
                }
                k = 1;
                while( (j - k >= 0) && (gMap[i][j - k].value === TileEnum.EMPTY) ) {
                    gMap[i][j - k].isCandidate = true;
                    k++;
                }
                k = 1;
                while( (i + k < gWidth) && (gMap[i + k][j].value === TileEnum.EMPTY) ) {
                    gMap[i + k][j].isCandidate = true;
                    k++;
                }
                k = 1;
                while( (i - k >= 0) && (gMap[i - k][j].value === TileEnum.EMPTY)) {
                    gMap[i - k][j].isCandidate = true;
                    k++;
                }
            }
        }
    }
};

// could be optimized will parallel computing... or taking into account search direction...
var searchMapForward = function(x, y, direction, fuel, path, useDiscovery) {
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
    searchMapMove(x, y, direction, fuel, path, useDiscovery);
};

var searchMapLeft = function(x, y, direction, fuel, path, useDiscovery) {
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
    searchMapMove(x, y, direction, fuel, path, useDiscovery);
};

var searchMapBackward = function(x, y, direction, fuel, path, useDiscovery) {
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
    searchMapMove(x, y, direction, fuel, path, useDiscovery);
};

var searchMapRight = function(x, y, direction, fuel, path, useDiscovery) {
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
    searchMapMove(x, y, direction, fuel, path, useDiscovery);
};

var searchMapMove = function(x, y, direction, fuel, path, useDiscovery) {
    if (!(gMap[x][y].value === TileEnum.EMPTY ||
          gMap[x][y].value === TileEnum.ENEMY)) {
        return;
    }
    if (isTileInList(x, y, path)) {
        return;
    }

    if (!gMap[x][y].searched) {
        gMap[x][y].searched = true;
    } else {
        if (gMap[x][y].fuel < fuel) {
            return;
        }
    }

    gMap[x][y].fuel = fuel;
    path.push(gMap[x][y]);

    if (gMap[x][y].isCandidate) {
        var discovery = 0;
        if (useDiscovery) {
            initDiscovery();
            discovery = computePathDiscovery(path);            
        }
        //console.log("Another path to ("+x+","+y+") is found with: fuel: "+fuel+" and discovery: "+discovery);
        if (gPath.found) {
            // we update if we have a better discovery factor
            if (gPath.discovery < discovery) {
                gPath.fuel = fuel;
                gPath.discovery = discovery;
                gPath.steps = path.slice();
                //console.log("Better discovery path: ");
                //printPath(gPath);
                return;
            }
            // for a similar discovery, we take the best fuel consumption
            if (gPath.discovery === discovery && gPath.fuel > fuel) {
                gPath.fuel = fuel;
                gPath.discovery = discovery;
                gPath.steps = path.slice();
                //console.log("Better fuel path: ");
                //printPath(gPath);
            }
        } else {
            // first path found so far!!
            gPath.found = true;
            gPath.fuel = fuel;
            gPath.discovery = discovery;
            gPath.steps = path.slice();
            //console.log("First path: ");
            //printPath(gPath);
        }
        return;
    }

    if ( gMap[x][y].periodicEnemy ) {
        return;
    }

    // don't go past the current maximum!
    if ( gPath.found && gPath.fuel < fuel) {
        return;
    }

    searchMapForward(x, y, direction, fuel, path.slice(), useDiscovery);
    searchMapRight(x, y, direction, fuel, path.slice(), useDiscovery);
    searchMapLeft(x, y, direction, fuel, path.slice(), useDiscovery);
    searchMapBackward(x, y, direction, fuel, path.slice(), useDiscovery); 
};

var initDiscovery = function() {
    for(var i=0; i<gWidth; i++) {
        for (j=0; j<gHeight; j++) {
            delete gMap[i][j].discovered;
        }
    }
};

var computePathDiscovery = function(path) {
    var result = 0;
    for (var i = 0; i < path.length; i++) {
        result += computeDiscovery(path[i]);
    }
    return result;
};

var computeDiscovery = function(tile) {
    var result = 0;
    var x = tile.x;
    var y = tile.y;

    var i=1;
    while((x+i < gWidth) && ((gMap[x+i][y].value === TileEnum.UNKNOWN) || (gMap[x+i][y].value === TileEnum.EMPTY))) {
        if (gMap[x+i][y].value === TileEnum.UNKNOWN &&
            !gMap[x+i][y].discovered) {
            gMap[x+i][y].discovered = true;
            result++;
        }
        i++;
    }
    i=1;
    while((x-i >= 0) && ((gMap[x-i][y].value === TileEnum.UNKNOWN) || (gMap[x-i][y].value === TileEnum.EMPTY))) {
        if (gMap[x-i][y].value === TileEnum.UNKNOWN &&
            !gMap[x-i][y].discovered) {
            gMap[x-i][y].discovered = true;
            result++;
        }
        i++;
    }
    i=1;
    while((y+i < gHeight) && ((gMap[x][y+i].value === TileEnum.UNKNOWN) || (gMap[x][y+i].value === TileEnum.EMPTY))) {
        if (gMap[x][y+i].value === TileEnum.UNKNOWN &&
            !gMap[x][y+i].discovered) {
            gMap[x][y+i].discovered = true;
            result++;
        }
        i++;
    }
    i=1;
    while((y-i >= 0) && ((gMap[x][y-i].value === TileEnum.UNKNOWN) || (gMap[x][y-i].value === TileEnum.EMPTY))) {
        if (gMap[x][y-i].value === TileEnum.UNKNOWN &&
            !gMap[x][y-i].discovered) {
            gMap[x][y-i].discovered = true;
            result++;
        }
        i++;
    }

    return result;
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
    if (tile.value !== TileEnum.EMPTY) {
        // might add a test to fire.....
        if ( tile.value === TileEnum.ENEMY && 
             isTileInView(tile) &&
             !tile.periodicEnemy) {
            fireCannon();            
        }
        throw {isAction: true, action: "Tile occupied by " + tile.value + ", waiting one turn!"};
    }

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
        gPath.step++;
        throw {isAction: true, action: "Turning Left!", moved: false};
    }

    switch(gDirection) {
        case DirectionEnum.NORTH:
            switch(goingTo) {
                case DirectionEnum.NORTH:
                    moveForward();
                    break;
                case DirectionEnum.SOUTH:
                    moveBackward();
                    break;
                case DirectionEnum.EAST:
                    turnRight();
                    break;
                case DirectionEnum.WEST:
                    turnLeft();
                    break;
            }
            break;
        case DirectionEnum.SOUTH:
            switch(goingTo) {
                case DirectionEnum.NORTH:
                    moveBackward();
                    break;
                case DirectionEnum.SOUTH:
                    moveForward();
                    break;
                case DirectionEnum.EAST:
                    turnLeft();
                    break;
                case DirectionEnum.WEST:
                    turnRight();
                    break;
            }
            break;
        case DirectionEnum.EAST:
            switch(goingTo) {
                case DirectionEnum.NORTH:
                    turnLeft();
                    break;
                case DirectionEnum.SOUTH:
                    turnRight();
                    break;
                case DirectionEnum.EAST:
                    moveForward();
                    break;
                case DirectionEnum.WEST:
                    moveBackward();
                    break;
            }
            break;
        case DirectionEnum.WEST:
            switch(goingTo) {
                case DirectionEnum.NORTH:
                    turnRight();
                    break;
                case DirectionEnum.SOUTH:
                    turnLeft();
                    break;
                case DirectionEnum.EAST:
                    moveBackward();
                    break;
                case DirectionEnum.WEST:
                    moveForward();
                    break;
            }
            break;
    }
};

// TODO: when turning 180°, the choice between right or left could be optimized not to face wall!
var performOrientation = function(direction) {
    switch(gDirection) {
        case DirectionEnum.NORTH:
            switch(direction) {
                case DirectionEnum.SOUTH:
                    turnRight();
                    break;
                case DirectionEnum.EAST:
                    turnRight();
                    break;
                case DirectionEnum.WEST:
                    turnLeft();
                    break;
            }
            break;
        case DirectionEnum.SOUTH:
            switch(direction) {
                case DirectionEnum.NORTH:
                    turnRight();
                    break;
                case DirectionEnum.EAST:
                    turnLeft();
                    break;
                case DirectionEnum.WEST:
                    turnRight();
                    break;
            }
            break;
        case DirectionEnum.EAST:
            switch(direction) {
                case DirectionEnum.NORTH:
                    turnLeft();
                    break;
                case DirectionEnum.SOUTH:
                    turnRight();
                    break;
                case DirectionEnum.WEST:
                    turnRight();
                    break;
            }
            break;
        case DirectionEnum.WEST:
            switch(direction) {
                case DirectionEnum.NORTH:
                    turnRight();
                    break;
                case DirectionEnum.SOUTH:
                    turnLeft();
                    break;
                case DirectionEnum.EAST:
                    turnRight();
                    break;
            }
            break;
        }
};
